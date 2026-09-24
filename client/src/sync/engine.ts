import type { PushOp } from "@shared/sync";
import type { SqlDb } from "@/data/sql";
import {
  dueAiOps,
  markFailed,
  nextWakeAt,
  outboxCounts,
  pendingDataOps,
  removeOps,
  resetBackoff,
  retryFailed,
  scheduleRetry,
  setState,
  type OutboxOp,
} from "@/data/outbox";
import {
  applyServerNote,
  applyServerPhoto,
  applyServerSkier,
  applyServerSummary,
  getKv,
  getNote,
  getSkier,
  getSkierPhoto,
  getSummary,
  notePayload,
  setKv,
  setSummaryStatus,
  skierPayload,
  skiersNeedingPhotoDownload,
} from "@/data/repo";
import { ApiError, type Api, type FailureKind } from "./api";

// Pushes the outbox and pulls server changes whenever there is signal.
// Nothing is ever dropped because of the network: failed attempts back off
// (2s doubling to 5 min) and retry indefinitely; a regained connection or the
// app returning to the foreground retries everything immediately.

export interface SyncStatus {
  signedIn: boolean;
  online: boolean;
  syncing: boolean;
  pending: number;
  aiPending: number;
  failed: number;
  lastSyncAt: number | null;
  lastError: string | null;
  authExpired: boolean;
  aiKeyProblem: string | null;
}

export interface SyncEngineDeps {
  db: SqlDb;
  api: Pick<Api, "push" | "pull" | "transcribe" | "summary" | "putSkierPhoto" | "getSkierPhoto">;
  isSignedIn(): boolean;
  readAudio(fileName: string): Promise<Blob | null>;
  onDataChanged(): void;
  now?(): number;
  random?(): number;
  setTimer?(fn: () => void, ms: number): unknown;
  clearTimer?(handle: unknown): void;
}

const DATA_BATCH = 25;
const MAX_BACKOFF_MS = 5 * 60_000;
const AI_KEY_BACKOFF_MS = 10 * 60_000;
const PERIODIC_SYNC_MS = 60_000;

type LaneResult = "drained" | "blocked" | "stopped";

export function backoffMs(attempts: number, kind: FailureKind, random: number) {
  if (kind === "ai-key") return AI_KEY_BACKOFF_MS;
  const base = Math.min(MAX_BACKOFF_MS, 2000 * 2 ** Math.min(attempts, 12));
  return Math.round(base * (0.8 + 0.4 * random));
}

function failureKind(err: unknown): FailureKind {
  return err instanceof ApiError ? err.kind : "retry";
}

function message(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

export class SyncEngine {
  private status: SyncStatus = {
    signedIn: false,
    online: true,
    syncing: false,
    pending: 0,
    aiPending: 0,
    failed: 0,
    lastSyncAt: null,
    lastError: null,
    authExpired: false,
    aiKeyProblem: null,
  };
  private listeners = new Set<() => void>();
  private running: Promise<void> | null = null;
  private rerun = false;
  private timer: unknown = null;
  private changed = false;
  private stopped = false;

  constructor(private deps: SyncEngineDeps) {}

  private now() {
    return this.deps.now?.() ?? Date.now();
  }
  private random() {
    return this.deps.random?.() ?? Math.random();
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getStatus(): SyncStatus {
    return this.status;
  }

  private update(patch: Partial<SyncStatus>) {
    this.status = { ...this.status, ...patch };
    this.listeners.forEach((l) => l());
  }

  async refreshCounts() {
    const counts = await outboxCounts(this.deps.db);
    this.update({ ...counts, signedIn: this.deps.isSignedIn() });
  }

  async setOnline(online: boolean) {
    const wasOnline = this.status.online;
    this.update({ online });
    if (online && !wasOnline) await this.flushNow();
  }

  // Coach tapped "Sync now", the app came to the foreground, or the network
  // came back: forget backoff timers and go.
  async flushNow() {
    await this.deps.db.transaction((tx) => resetBackoff(tx));
    this.update({ authExpired: this.deps.isSignedIn() ? false : this.status.authExpired });
    return this.requestSync();
  }

  onSignedIn() {
    this.update({ authExpired: false, aiKeyProblem: null, signedIn: true });
    return this.flushNow();
  }

  onKeyChanged() {
    this.update({ aiKeyProblem: null });
    return this.flushNow();
  }

  async retryFailed(seq?: number) {
    await this.deps.db.transaction((tx) => retryFailed(tx, seq));
    return this.requestSync();
  }

  async discardFailed(seq: number) {
    await this.deps.db.transaction((tx) => removeOps(tx, [seq]));
    await this.refreshCounts();
  }

  stop() {
    this.stopped = true;
    if (this.timer !== null) (this.deps.clearTimer ?? clearTimeout)(this.timer as any);
  }

  // Single-flight: a request while a sync is running schedules one more pass.
  requestSync(): Promise<void> {
    if (this.running) {
      this.rerun = true;
      return this.running;
    }
    this.running = (async () => {
      try {
        do {
          this.rerun = false;
          await this.runOnce();
        } while (this.rerun && !this.stopped);
      } finally {
        this.running = null;
      }
    })();
    return this.running;
  }

  private async runOnce() {
    this.changed = false;
    const signedIn = this.deps.isSignedIn();
    if (!signedIn || !this.status.online || this.status.authExpired) {
      await this.refreshCounts();
      await this.scheduleWake();
      return;
    }
    this.update({ syncing: true, signedIn: true });
    let hadError = false;
    try {
      const data = await this.pushDataLane();
      if (data === "stopped") return;
      hadError = data === "blocked";
      if (data === "drained") {
        const ai = await this.runAiLane();
        if (ai === "stopped") return;
      }
      const pulled = await this.pull();
      if (pulled === "stopped") return;
      if (pulled === "ok" && !hadError) {
        this.update({ lastSyncAt: this.now(), lastError: null });
      }
    } catch (err) {
      // Local database trouble; surface it and try again later.
      this.update({ lastError: message(err) });
    } finally {
      this.update({ syncing: false });
      await this.refreshCounts();
      if (this.changed) this.deps.onDataChanged();
      await this.scheduleWake();
    }
  }

  private async scheduleWake() {
    if (this.timer !== null) {
      (this.deps.clearTimer ?? clearTimeout)(this.timer as any);
      this.timer = null;
    }
    if (this.stopped || !this.deps.isSignedIn() || !this.status.online || this.status.authExpired) return;
    const next = await nextWakeAt(this.deps.db);
    let delay = PERIODIC_SYNC_MS;
    if (next !== null) delay = Math.min(delay, Math.max(250, next - this.now()));
    this.timer = (this.deps.setTimer ?? setTimeout)(() => {
      this.timer = null;
      void this.requestSync();
    }, delay);
  }

  // Returns "stopped" when the whole sync must halt (signed out).
  private async handleFailure(op: OutboxOp, err: unknown): Promise<"stopped" | "parked" | "retry"> {
    const kind = failureKind(err);
    const msg = message(err);
    if (kind === "auth") {
      await this.deps.db.transaction((tx) => setState(tx, [op.seq], "pending"));
      this.update({ authExpired: true, lastError: "Sign in again to keep syncing. Your work is safe on this phone." });
      return "stopped";
    }
    if (kind === "permanent") {
      await this.deps.db.transaction((tx) => markFailed(tx, op.seq, msg));
      return "parked";
    }
    const next = this.now() + backoffMs(op.attempts, kind, this.random());
    await this.deps.db.transaction((tx) => scheduleRetry(tx, op.seq, next, msg));
    if (kind === "ai-key") this.update({ aiKeyProblem: msg });
    else this.update({ lastError: kind === "network" ? "Offline — changes are saved and will sync later" : msg });
    return "retry";
  }

  private async pushDataLane(): Promise<LaneResult> {
    const { db, api } = this.deps;
    for (;;) {
      const ops = await pendingDataOps(db, DATA_BATCH);
      if (ops.length === 0) return "drained";
      const head = ops[0];
      if (head.nextAttemptAt > this.now()) return "blocked";

      // Photos are too big to batch; they go one at a time, in queue order.
      if (head.kind === "photo") {
        const outcome = await this.pushPhoto(head);
        if (outcome === "stopped") return "stopped";
        if (outcome === "blocked") return "blocked";
        continue;
      }
      const firstPhoto = ops.findIndex((o) => o.kind === "photo");
      const batch = firstPhoto === -1 ? ops : ops.slice(0, firstPhoto);

      const pushOps: PushOp[] = [];
      const sent: OutboxOp[] = [];
      await db.transaction(async (tx) => {
        const orphans: number[] = [];
        for (const op of batch) {
          if (op.kind === "skier") {
            const skier = await getSkier(tx, op.entityId);
            if (!skier) orphans.push(op.seq);
            else {
              pushOps.push({ opId: op.opId, kind: "skier", data: skierPayload(skier) });
              sent.push(op);
            }
          } else if (op.kind === "note") {
            const note = await getNote(tx, op.entityId);
            if (!note) orphans.push(op.seq);
            else {
              pushOps.push({ opId: op.opId, kind: "note", data: notePayload(note) });
              sent.push(op);
            }
          }
        }
        await removeOps(tx, orphans);
        await setState(tx, sent.map((o) => o.seq), "inflight");
      });
      if (sent.length === 0) continue;

      let results;
      try {
        results = (await api.push(pushOps)).results;
      } catch (err) {
        await db.transaction((tx) => setState(tx, sent.map((o) => o.seq), "pending"));
        const outcome = await this.handleFailure(sent[0], err);
        if (outcome === "stopped") return "stopped";
        if (outcome === "parked") continue;
        return "blocked";
      }

      const byOpId = new Map(results.map((r) => [r.opId, r]));
      let missing = false;
      const retryAt = this.now() + backoffMs(head.attempts, "retry", this.random());
      await db.transaction(async (tx) => {
        const done: number[] = [];
        for (const op of sent) {
          const result = byOpId.get(op.opId);
          if (!result) {
            // Back off rather than resending immediately (a server that keeps
            // omitting results would otherwise be hit every wake-up).
            missing = true;
            await scheduleRetry(tx, op.seq, retryAt, "No result from server");
          } else if (result.status === "ok") {
            done.push(op.seq);
          } else {
            await markFailed(tx, op.seq, result.error ?? "Rejected by server");
          }
        }
        await removeOps(tx, done);
      });
      // "Not synced yet" markers depend on the outbox, so the UI must refresh.
      this.changed = true;
      if (missing) return "blocked";
    }
  }

  private async pushPhoto(op: OutboxOp): Promise<"sent" | "blocked" | "stopped"> {
    const { db, api } = this.deps;
    const photo = await getSkierPhoto(db, op.entityId);
    if (!photo) {
      await db.transaction((tx) => removeOps(tx, [op.seq]));
      return "sent";
    }
    await db.transaction((tx) => setState(tx, [op.seq], "inflight"));
    try {
      await api.putSkierPhoto(op.entityId, photo);
    } catch (err) {
      await db.transaction((tx) => setState(tx, [op.seq], "pending"));
      const outcome = await this.handleFailure(op, err);
      if (outcome === "stopped") return "stopped";
      return outcome === "parked" ? "sent" : "blocked";
    }
    await db.transaction((tx) => removeOps(tx, [op.seq]));
    this.changed = true;
    return "sent";
  }

  // Fetches photos the server has that are newer than this phone's copy
  // (e.g. after a reinstall). A few per pass so a big backlog can't stall sync.
  private async downloadPhotos() {
    const { db, api } = this.deps;
    const wanted = await skiersNeedingPhotoDownload(db, 10);
    for (const { id, photoUpdatedAt } of wanted) {
      try {
        const photo = await api.getSkierPhoto(id);
        await db.transaction((tx) => applyServerPhoto(tx, id, photo));
        this.changed = true;
      } catch (err) {
        const kind = failureKind(err);
        if (kind === "permanent") {
          // Nothing to fetch; record it so we don't ask again.
          await db.transaction((tx) =>
            applyServerPhoto(tx, id, { photo: null, thumb: null, updatedAt: photoUpdatedAt }),
          );
          continue;
        }
        return;
      }
    }
  }

  private async runAiLane(): Promise<LaneResult> {
    const { db } = this.deps;
    for (;;) {
      const ops = await dueAiOps(db, this.now(), 5);
      if (ops.length === 0) return "drained";
      for (const op of ops) {
        await db.transaction((tx) => setState(tx, [op.seq], "inflight"));
        try {
          if (op.kind === "transcribe") await this.transcribe(op);
          else if (op.kind === "summary") await this.summarize(op);
          await db.transaction((tx) => removeOps(tx, [op.seq]));
          this.changed = true;
        } catch (err) {
          const outcome = await this.handleFailure(op, err);
          if (outcome === "stopped") return "stopped";
          // No signal: don't hammer the remaining AI ops this round.
          if (failureKind(err) === "network") return "blocked";
        }
      }
    }
  }

  private async transcribe(op: OutboxOp) {
    const { db, api } = this.deps;
    const note = await getNote(db, op.entityId);
    if (!note || note.deletedAt || !note.audioFile) return;
    let audio: Blob | null;
    try {
      audio = await this.deps.readAudio(note.audioFile);
    } catch (err) {
      throw new ApiError(422, `Couldn't read the recording on this phone: ${message(err)}`);
    }
    if (!audio) throw new ApiError(410, `The recording is missing on this phone (${note.audioFile})`);
    const res = await api.transcribe(note.id, audio, note.audioFile);
    await db.transaction(async (tx) => {
      await applyServerNote(tx, res.note);
      for (const extra of res.createdNotes) await applyServerNote(tx, extra);
    });
  }

  private async summarize(op: OutboxOp) {
    const { db, api } = this.deps;
    const summary = await getSummary(db, op.entityId);
    if (!summary) return;
    await db.transaction((tx) => setSummaryStatus(tx, summary.id, "pending", null));
    this.deps.onDataChanged();
    try {
      const res = await api.summary(summary.skierId, summary.id, summary.requestedAt, summary.equipment);
      await db.transaction((tx) => applyServerSummary(tx, res.summary));
    } catch (err) {
      const kind = failureKind(err);
      await db.transaction((tx) =>
        kind === "permanent"
          ? setSummaryStatus(tx, summary.id, "error", message(err))
          : setSummaryStatus(tx, summary.id, "queued", kind === "ai-key" ? message(err) : null),
      );
      this.changed = true;
      throw err;
    }
  }

  private async pull(): Promise<"ok" | "failed" | "stopped"> {
    const { db, api } = this.deps;
    const since = await getKv(db, "pullCursor");
    let res;
    try {
      res = await api.pull(since);
    } catch (err) {
      if (failureKind(err) === "auth") {
        this.update({ authExpired: true, lastError: "Sign in again to keep syncing. Your work is safe on this phone." });
        return "stopped";
      }
      this.update({ lastError: failureKind(err) === "network" ? "Offline — changes are saved and will sync later" : message(err) });
      return "failed";
    }
    await db.transaction(async (tx) => {
      for (const s of res.skiers) await applyServerSkier(tx, s);
      for (const n of res.notes) await applyServerNote(tx, n);
      for (const s of res.summaries) await applyServerSummary(tx, s);
      await setKv(tx, "pullCursor", res.cursor);
    });
    if (res.skiers.length || res.notes.length || res.summaries.length) this.changed = true;
    await this.downloadPhotos();
    return "ok";
  }
}
