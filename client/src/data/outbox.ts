import type { SqlExecutor } from "./sql";
import { uuid } from "@/lib/ids";

// Durable queue of work for the server. An op only names the entity; the row
// is read at send time, so ten edits to one note while offline send once.
//
// Lanes:
//  - data: skier/note upserts, sent strictly in order (a skier before its notes)
//  - ai:   transcription and summaries, run only once the data lane is drained

export type OutboxLane = "data" | "ai";
export type OutboxKind = "skier" | "note" | "transcribe" | "summary";
export type OutboxState = "pending" | "inflight" | "failed";

export interface OutboxOp {
  seq: number;
  opId: string;
  lane: OutboxLane;
  kind: OutboxKind;
  entityId: string;
  state: OutboxState;
  attempts: number;
  nextAttemptAt: number;
  lastError: string | null;
  createdAt: number;
}

const LANE_FOR: Record<OutboxKind, OutboxLane> = {
  skier: "data",
  note: "data",
  transcribe: "ai",
  summary: "ai",
};

interface OutboxDbRow {
  seq: number;
  op_id: string;
  lane: OutboxLane;
  kind: OutboxKind;
  entity_id: string;
  state: OutboxState;
  attempts: number;
  next_attempt_at: number;
  last_error: string | null;
  created_at: number;
}

function fromRow(r: OutboxDbRow): OutboxOp {
  return {
    seq: r.seq,
    opId: r.op_id,
    lane: r.lane,
    kind: r.kind,
    entityId: r.entity_id,
    state: r.state,
    attempts: r.attempts,
    nextAttemptAt: r.next_attempt_at,
    lastError: r.last_error,
    createdAt: r.created_at,
  };
}

export async function enqueue(tx: SqlExecutor, kind: OutboxKind, entityId: string, now = Date.now()) {
  // A queued (not yet sending) op for the same entity will pick up the latest
  // row when it's sent, so there's no need for another.
  const existing = await tx.all<{ seq: number }>(
    "SELECT seq FROM outbox WHERE kind = ? AND entity_id = ? AND state = 'pending' LIMIT 1",
    [kind, entityId],
  );
  if (existing.length > 0) return;
  await tx.run(
    "INSERT INTO outbox (op_id, lane, kind, entity_id, state, attempts, next_attempt_at, created_at) VALUES (?, ?, ?, ?, 'pending', 0, 0, ?)",
    [uuid(), LANE_FOR[kind], kind, entityId, now],
  );
}

export async function removeOpsForEntity(tx: SqlExecutor, kind: OutboxKind, entityId: string) {
  await tx.run("DELETE FROM outbox WHERE kind = ? AND entity_id = ? AND state != 'inflight'", [kind, entityId]);
}

export async function pendingDataOps(tx: SqlExecutor, limit: number): Promise<OutboxOp[]> {
  const rows = await tx.all<OutboxDbRow>(
    "SELECT * FROM outbox WHERE lane = 'data' AND state = 'pending' ORDER BY seq LIMIT ?",
    [limit],
  );
  return rows.map(fromRow);
}

export async function dueAiOps(tx: SqlExecutor, now: number, limit: number): Promise<OutboxOp[]> {
  const rows = await tx.all<OutboxDbRow>(
    "SELECT * FROM outbox WHERE lane = 'ai' AND state = 'pending' AND next_attempt_at <= ? ORDER BY seq LIMIT ?",
    [now, limit],
  );
  return rows.map(fromRow);
}

export async function allOps(tx: SqlExecutor): Promise<OutboxOp[]> {
  const rows = await tx.all<OutboxDbRow>("SELECT * FROM outbox ORDER BY seq");
  return rows.map(fromRow);
}

// Includes parked (failed) ops: a pull must not overwrite a local change the
// coach may still retry from Settings.
export async function hasPendingDataOp(tx: SqlExecutor, kind: OutboxKind, entityId: string) {
  const rows = await tx.all<{ seq: number }>(
    "SELECT seq FROM outbox WHERE lane = 'data' AND kind = ? AND entity_id = ? AND state IN ('pending', 'inflight', 'failed') LIMIT 1",
    [kind, entityId],
  );
  return rows.length > 0;
}

export async function setState(tx: SqlExecutor, seqs: number[], state: OutboxState) {
  if (seqs.length === 0) return;
  await tx.run(`UPDATE outbox SET state = ? WHERE seq IN (${seqs.map(() => "?").join(",")})`, [state, ...seqs]);
}

export async function removeOps(tx: SqlExecutor, seqs: number[]) {
  if (seqs.length === 0) return;
  await tx.run(`DELETE FROM outbox WHERE seq IN (${seqs.map(() => "?").join(",")})`, seqs);
}

export async function scheduleRetry(tx: SqlExecutor, seq: number, nextAttemptAt: number, error: string) {
  await tx.run(
    "UPDATE outbox SET state = 'pending', attempts = attempts + 1, next_attempt_at = ?, last_error = ? WHERE seq = ?",
    [nextAttemptAt, error, seq],
  );
}

export async function markFailed(tx: SqlExecutor, seq: number, error: string) {
  await tx.run("UPDATE outbox SET state = 'failed', attempts = attempts + 1, last_error = ? WHERE seq = ?", [
    error,
    seq,
  ]);
}

// When the connection comes back, don't make the backlog wait out old backoffs.
export async function resetBackoff(tx: SqlExecutor) {
  await tx.run("UPDATE outbox SET next_attempt_at = 0 WHERE state = 'pending'");
}

export async function retryFailed(tx: SqlExecutor, seq?: number) {
  if (seq === undefined) {
    await tx.run("UPDATE outbox SET state = 'pending', next_attempt_at = 0 WHERE state = 'failed'");
  } else {
    await tx.run("UPDATE outbox SET state = 'pending', next_attempt_at = 0 WHERE seq = ?", [seq]);
  }
}

export async function outboxCounts(tx: SqlExecutor) {
  const rows = await tx.all<{ lane: string; state: string; n: number }>(
    "SELECT lane, state, COUNT(*) AS n FROM outbox GROUP BY lane, state",
  );
  let pending = 0;
  let aiPending = 0;
  let failed = 0;
  for (const r of rows) {
    if (r.state === "failed") failed += r.n;
    else if (r.lane === "ai") aiPending += r.n;
    else pending += r.n;
  }
  return { pending, aiPending, failed };
}

// When the engine can next make progress. Data ops go strictly in order, so
// only the head's backoff matters (ops queued behind it have next_attempt_at 0
// but can't be sent yet); AI ops only run once the data lane is empty.
export async function nextWakeAt(tx: SqlExecutor): Promise<number | null> {
  const [head] = await tx.all<{ t: number }>(
    "SELECT next_attempt_at AS t FROM outbox WHERE lane = 'data' AND state = 'pending' ORDER BY seq LIMIT 1",
  );
  if (head) return head.t;
  const [row] = await tx.all<{ t: number | null }>(
    "SELECT MIN(next_attempt_at) AS t FROM outbox WHERE lane = 'ai' AND state = 'pending'",
  );
  return row?.t ?? null;
}
