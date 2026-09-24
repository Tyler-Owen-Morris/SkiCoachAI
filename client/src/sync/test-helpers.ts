import initSqlJs from "sql.js";
import type {
  NotePayload,
  PullResponse,
  PushOp,
  PushResponse,
  ServerNote,
  ServerSkier,
  ServerSummary,
  SkierPhotoPayload,
  SummaryResponse,
  TranscribeResponse,
} from "@shared/sync";
import type { NoteRow, SkierRow } from "@shared/schema";
import { mergeNote, mergeSkier } from "../../../server/merge";
import { createSqlJsDb, type SqlDb } from "@/data/sql";
import { migrate } from "@/data/schema";
import { ApiError } from "./api";
import { SyncEngine } from "./engine";

export async function memoryDb(): Promise<SqlDb> {
  const SQL = await initSqlJs();
  const db = createSqlJsDb(new SQL.Database());
  await migrate(db);
  return db;
}

// In-memory stand-in for the real server, using the server's merge rules.
export class FakeServer {
  skiers = new Map<string, SkierRow>();
  notes = new Map<string, NoteRow>();
  summaries = new Map<string, ServerSummary>();
  photos = new Map<string, SkierPhotoPayload>();
  online = true;
  // Next N calls fail with this status (0 = network).
  failures: number[] = [];
  // Apply the push but lose the response, like a dropped connection.
  loseNextResponse = false;
  transcriptFor = (_noteId: string) => "cloud transcript";
  assignTo: string | null = null;
  pushCalls = 0;
  tick = 1_000_000;

  private gate() {
    if (!this.online) throw new ApiError(0, "No connection to the server");
    const next = this.failures.shift();
    if (next !== undefined) throw new ApiError(next, `status ${next}`, next === 424 ? "openai_key_invalid" : undefined);
  }

  private stampServer() {
    this.tick += 1000;
    return new Date(this.tick);
  }

  private skierOut(r: SkierRow): ServerSkier {
    return {
      id: r.id,
      name: r.name,
      level: r.level as ServerSkier["level"],
      age: r.age,
      initialNotes: r.initialNotes,
      equipment: r.equipment as ServerSkier["equipment"],
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.clientUpdatedAt.toISOString(),
      deletedAt: r.deletedAt?.toISOString() ?? null,
      archivedAt: r.archivedAt?.toISOString() ?? null,
      photoUpdatedAt: r.photoUpdatedAt?.toISOString() ?? null,
      serverUpdatedAt: r.updatedAt.toISOString(),
    };
  }

  noteOut(r: NoteRow): ServerNote {
    return {
      id: r.id,
      skierId: r.skierId,
      equipment: r.equipment as ServerNote["equipment"],
      content: r.content,
      deviceTranscript: r.deviceTranscript,
      cloudTranscript: r.cloudTranscript,
      transcriptSource: r.transcriptSource as NotePayload["transcriptSource"],
      assignmentStatus: r.assignmentStatus as NotePayload["assignmentStatus"],
      userEdited: r.userEdited,
      hasAudio: r.hasAudio,
      audioDurationMs: r.audioDurationMs,
      recordedAt: r.recordedAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.clientUpdatedAt.toISOString(),
      deletedAt: r.deletedAt?.toISOString() ?? null,
      serverUpdatedAt: r.updatedAt.toISOString(),
    };
  }

  api = {
    push: async (ops: PushOp[]): Promise<PushResponse> => {
      this.pushCalls++;
      this.gate();
      const results: PushResponse["results"] = [];
      for (const op of ops) {
        if (op.kind === "skier") {
          if (op.data.name === "REJECT") {
            results.push({ opId: op.opId, status: "rejected", error: "bad skier" });
            continue;
          }
          const existing = this.skiers.get(op.data.id);
          const write = mergeSkier(existing, op.data);
          if (write) {
            this.skiers.set(op.data.id, {
              ...write,
              coachId: "c",
              photoUpdatedAt: existing?.photoUpdatedAt ?? null,
              updatedAt: this.stampServer(),
            });
          }
        } else {
          const write = mergeNote(this.notes.get(op.data.id), op.data);
          if (write) this.notes.set(op.data.id, { ...write, coachId: "c", updatedAt: this.stampServer() });
        }
        results.push({ opId: op.opId, status: "ok" });
      }
      if (this.loseNextResponse) {
        this.loseNextResponse = false;
        throw new ApiError(0, "connection dropped");
      }
      return { results };
    },
    pull: async (since: string | null): Promise<PullResponse> => {
      this.gate();
      const after = since ? Date.parse(since) - 10_000 : -Infinity;
      return {
        skiers: [...this.skiers.values()].filter((r) => r.updatedAt.getTime() > after).map((r) => this.skierOut(r)),
        notes: [...this.notes.values()].filter((r) => r.updatedAt.getTime() > after).map((r) => this.noteOut(r)),
        summaries: [...this.summaries.values()].filter((s) => Date.parse(s.serverUpdatedAt) > after),
        cursor: new Date(this.tick).toISOString(),
      };
    },
    transcribe: async (noteId: string, _audio: Blob, _fileName: string): Promise<TranscribeResponse> => {
      this.gate();
      const note = this.notes.get(noteId);
      if (!note) throw new ApiError(409, "Note not synced yet");
      const text = this.transcriptFor(noteId);
      const updated: NoteRow = {
        ...note,
        cloudTranscript: text,
        ...(note.userEdited ? {} : { content: text, transcriptSource: "cloud" }),
        ...(this.assignTo && (note.assignmentStatus === "unassigned" || note.assignmentStatus === "local-guess")
          ? { skierId: this.assignTo, assignmentStatus: "ai" }
          : {}),
        updatedAt: this.stampServer(),
      };
      this.notes.set(noteId, updated);
      return { note: this.noteOut(updated), createdNotes: [] };
    },
    putSkierPhoto: async (skierId: string, photo: SkierPhotoPayload): Promise<{ ok: true }> => {
      this.gate();
      const skier = this.skiers.get(skierId);
      if (!skier) throw new ApiError(409, "Skier not synced yet");
      const existing = this.photos.get(skierId);
      if (!existing || photo.updatedAt >= existing.updatedAt) {
        this.photos.set(skierId, photo);
        this.skiers.set(skierId, { ...skier, photoUpdatedAt: new Date(photo.updatedAt), updatedAt: this.stampServer() });
      }
      return { ok: true };
    },
    getSkierPhoto: async (skierId: string): Promise<SkierPhotoPayload> => {
      this.gate();
      const photo = this.photos.get(skierId);
      if (!photo) throw new ApiError(404, "No such skier");
      return photo;
    },
    summary: async (
      skierId: string,
      id: string,
      requestedAt: string,
      equipment: ServerSummary["equipment"],
    ): Promise<SummaryResponse> => {
      this.gate();
      if (!this.skiers.has(skierId)) throw new ApiError(409, "Skier not synced yet");
      const summary: ServerSummary = {
        id,
        skierId,
        equipment,
        status: "ready",
        content: { overview: "Good progress", strengths: ["balance"], areasToImprove: ["edging"], drills: [], nextFocus: "edging" },
        error: null,
        noteCount: [...this.notes.values()].filter((n) => n.skierId === skierId && n.equipment === equipment).length,
        requestedAt,
        serverUpdatedAt: this.stampServer().toISOString(),
      };
      this.summaries.set(id, summary);
      return { summary };
    },
  };
}

export function makeEngine(
  db: SqlDb,
  server: FakeServer,
  opts: { signedIn?: () => boolean; clock?: { now: number }; onTimer?: (ms: number) => void } = {},
) {
  const clock = opts.clock ?? { now: Date.now() };
  const engine = new SyncEngine({
    db,
    api: server.api,
    isSignedIn: opts.signedIn ?? (() => true),
    readAudio: async () => new Blob([new Uint8Array([1, 2, 3])], { type: "audio/mp4" }),
    onDataChanged: () => undefined,
    now: () => clock.now,
    random: () => 0.5,
    // Tests drive syncs explicitly.
    setTimer: (_fn, ms) => {
      opts.onTimer?.(ms);
      return 1;
    },
    clearTimer: () => undefined,
  });
  return { engine, clock };
}
