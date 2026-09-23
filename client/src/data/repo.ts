import type {
  AssignmentStatus,
  NotePayload,
  ServerNote,
  ServerSkier,
  ServerSummary,
  SkierPayload,
  SummaryContent,
  TranscriptSource,
} from "@shared/sync";
import type { SqlDb, SqlExecutor } from "./sql";
import { enqueue, hasPendingDataOp, removeOpsForEntity } from "./outbox";
import { uuid } from "@/lib/ids";

export type SkierLevel = SkierPayload["level"];

export interface Skier {
  id: string;
  name: string;
  level: SkierLevel;
  age: number | null;
  initialNotes: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface SkierWithStats extends Skier {
  noteCount: number;
  lastNoteAt: string | null;
}

export interface Note {
  id: string;
  skierId: string | null;
  content: string;
  deviceTranscript: string | null;
  cloudTranscript: string | null;
  transcriptSource: TranscriptSource;
  assignmentStatus: AssignmentStatus;
  userEdited: boolean;
  hasAudio: boolean;
  audioFile: string | null;
  audioMime: string | null;
  audioDurationMs: number | null;
  recordedAt: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export type LocalSummaryStatus = "queued" | "pending" | "ready" | "error";
export interface Summary {
  id: string;
  skierId: string;
  status: LocalSummaryStatus;
  content: SummaryContent | null;
  error: string | null;
  noteCount: number | null;
  requestedAt: string;
  updatedAt: string;
}

type Row = Record<string, any>;

const skierFromRow = (r: Row): Skier => ({
  id: r.id,
  name: r.name,
  level: r.level,
  age: r.age ?? null,
  initialNotes: r.initial_notes ?? null,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at ?? null,
});

const noteFromRow = (r: Row): Note => ({
  id: r.id,
  skierId: r.skier_id ?? null,
  content: r.content,
  deviceTranscript: r.device_transcript ?? null,
  cloudTranscript: r.cloud_transcript ?? null,
  transcriptSource: r.transcript_source,
  assignmentStatus: r.assignment_status,
  userEdited: !!r.user_edited,
  hasAudio: !!r.has_audio,
  audioFile: r.audio_file ?? null,
  audioMime: r.audio_mime ?? null,
  audioDurationMs: r.audio_duration_ms ?? null,
  recordedAt: r.recorded_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at ?? null,
});

const summaryFromRow = (r: Row): Summary => {
  let content: SummaryContent | null = null;
  if (r.content) {
    try {
      content = JSON.parse(r.content);
    } catch {
      content = null;
    }
  }
  return {
    id: r.id,
    skierId: r.skier_id,
    status: r.status,
    content,
    error: r.error ?? null,
    noteCount: r.note_count ?? null,
    requestedAt: r.requested_at,
    updatedAt: r.updated_at,
  };
};

// Device clock for last-writer-wins. Never goes backwards within a session,
// so two quick edits always order correctly.
let lastStamp = 0;
export function stamp(): string {
  const now = Math.max(Date.now(), lastStamp + 1);
  lastStamp = now;
  return new Date(now).toISOString();
}

// ---------------------------------------------------------------- reads

export async function listSkiers(db: SqlExecutor): Promise<SkierWithStats[]> {
  const rows = await db.all(
    `SELECT s.*,
       (SELECT COUNT(*) FROM notes n WHERE n.skier_id = s.id AND n.deleted_at IS NULL) AS note_count,
       (SELECT MAX(n.recorded_at) FROM notes n WHERE n.skier_id = s.id AND n.deleted_at IS NULL) AS last_note_at
     FROM skiers s WHERE s.deleted_at IS NULL ORDER BY s.name COLLATE NOCASE`,
  );
  return rows.map((r) => ({ ...skierFromRow(r), noteCount: Number(r.note_count ?? 0), lastNoteAt: (r.last_note_at as string | null) ?? null }));
}

export async function getSkier(db: SqlExecutor, id: string): Promise<Skier | null> {
  const [row] = await db.all("SELECT * FROM skiers WHERE id = ?", [id]);
  return row ? skierFromRow(row) : null;
}

export async function getNote(db: SqlExecutor, id: string): Promise<Note | null> {
  const [row] = await db.all("SELECT * FROM notes WHERE id = ?", [id]);
  return row ? noteFromRow(row) : null;
}

export async function listNotesForSkier(db: SqlExecutor, skierId: string): Promise<Note[]> {
  const rows = await db.all(
    "SELECT * FROM notes WHERE skier_id = ? AND deleted_at IS NULL ORDER BY recorded_at DESC",
    [skierId],
  );
  return rows.map(noteFromRow);
}

// Notes that need the coach: no skier yet, the AI wasn't sure, or the skier
// they're filed under was removed (e.g. the server kept an AI assignment to a
// skier deleted on the phone) - those would otherwise be visible nowhere.
export async function listInboxNotes(db: SqlExecutor): Promise<Note[]> {
  const rows = await db.all(
    `SELECT * FROM notes WHERE deleted_at IS NULL
       AND (skier_id IS NULL OR assignment_status = 'ai-uncertain'
            OR skier_id NOT IN (SELECT id FROM skiers WHERE deleted_at IS NULL))
     ORDER BY recorded_at DESC`,
  );
  return rows.map(noteFromRow);
}

export async function latestSummary(db: SqlExecutor, skierId: string): Promise<Summary | null> {
  const [row] = await db.all(
    "SELECT * FROM summaries WHERE skier_id = ? ORDER BY requested_at DESC LIMIT 1",
    [skierId],
  );
  return row ? summaryFromRow(row) : null;
}

export async function latestReadySummary(db: SqlExecutor, skierId: string): Promise<Summary | null> {
  const [row] = await db.all(
    "SELECT * FROM summaries WHERE skier_id = ? AND status = 'ready' ORDER BY requested_at DESC LIMIT 1",
    [skierId],
  );
  return row ? summaryFromRow(row) : null;
}

export async function getSummary(db: SqlExecutor, id: string): Promise<Summary | null> {
  const [row] = await db.all("SELECT * FROM summaries WHERE id = ?", [id]);
  return row ? summaryFromRow(row) : null;
}

export async function countNotes(db: SqlExecutor): Promise<number> {
  const [row] = await db.all<{ n: number }>("SELECT COUNT(*) AS n FROM notes WHERE deleted_at IS NULL");
  return Number(row?.n ?? 0);
}

// Ids of notes with changes or AI work still queued for the server.
export async function unsyncedNoteIds(db: SqlExecutor): Promise<Set<string>> {
  const rows = await db.all<{ entity_id: string }>(
    "SELECT DISTINCT entity_id FROM outbox WHERE kind IN ('note', 'transcribe') AND state != 'failed'",
  );
  return new Set(rows.map((r) => r.entity_id));
}

export async function getKv(db: SqlExecutor, key: string): Promise<string | null> {
  const [row] = await db.all<{ value: string | null }>("SELECT value FROM kv WHERE key = ?", [key]);
  return row?.value ?? null;
}

export async function setKv(db: SqlExecutor, key: string, value: string | null) {
  await db.run("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)", [key, value]);
}

// ---------------------------------------------------------------- writes
// Every write updates the local row and queues it for the server in one
// transaction, so nothing is ever saved locally but forgotten by sync.

async function writeSkierRow(tx: SqlExecutor, s: Skier) {
  await tx.run(
    `INSERT OR REPLACE INTO skiers (id, name, level, age, initial_notes, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [s.id, s.name, s.level, s.age, s.initialNotes, s.createdAt, s.updatedAt, s.deletedAt],
  );
}

async function writeNoteRow(tx: SqlExecutor, n: Note) {
  await tx.run(
    `INSERT OR REPLACE INTO notes (id, skier_id, content, device_transcript, cloud_transcript, transcript_source,
       assignment_status, user_edited, has_audio, audio_file, audio_mime, audio_duration_ms, recorded_at,
       created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      n.id,
      n.skierId,
      n.content,
      n.deviceTranscript,
      n.cloudTranscript,
      n.transcriptSource,
      n.assignmentStatus,
      n.userEdited,
      n.hasAudio,
      n.audioFile,
      n.audioMime,
      n.audioDurationMs,
      n.recordedAt,
      n.createdAt,
      n.updatedAt,
      n.deletedAt,
    ],
  );
}

async function writeSummaryRow(tx: SqlExecutor, s: Summary) {
  await tx.run(
    `INSERT OR REPLACE INTO summaries (id, skier_id, status, content, error, note_count, requested_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [s.id, s.skierId, s.status, s.content ? JSON.stringify(s.content) : null, s.error, s.noteCount, s.requestedAt, s.updatedAt],
  );
}

export interface SkierInput {
  name: string;
  level: SkierLevel;
  age: number | null;
  initialNotes: string | null;
}

export async function createSkier(db: SqlDb, input: SkierInput): Promise<Skier> {
  const now = stamp();
  const skier: Skier = { id: uuid(), ...input, createdAt: now, updatedAt: now, deletedAt: null };
  await db.transaction(async (tx) => {
    await writeSkierRow(tx, skier);
    await enqueue(tx, "skier", skier.id);
  });
  return skier;
}

export async function updateSkier(db: SqlDb, id: string, input: SkierInput) {
  await db.transaction(async (tx) => {
    const current = await getSkier(tx, id);
    if (!current) throw new Error("Skier not found");
    await writeSkierRow(tx, { ...current, ...input, updatedAt: stamp() });
    await enqueue(tx, "skier", id);
  });
}

export async function deleteSkier(db: SqlDb, id: string) {
  await db.transaction(async (tx) => {
    const current = await getSkier(tx, id);
    if (!current) return;
    const now = stamp();
    await writeSkierRow(tx, { ...current, deletedAt: now, updatedAt: now });
    await enqueue(tx, "skier", id);
    // Their notes go back to the inbox rather than disappearing.
    const notes = await listNotesForSkier(tx, id);
    for (const note of notes) {
      await writeNoteRow(tx, { ...note, skierId: null, assignmentStatus: "unassigned", updatedAt: stamp() });
      await enqueue(tx, "note", note.id);
    }
  });
}

export interface VoiceNoteInput {
  skierId: string | null;
  assignmentStatus: AssignmentStatus;
  transcript: string;
  audioFile: string | null;
  audioMime: string | null;
  durationMs: number | null;
  recordedAt: string;
}

export async function saveVoiceNote(db: SqlDb, input: VoiceNoteInput): Promise<Note> {
  const now = stamp();
  const note: Note = {
    id: uuid(),
    skierId: input.skierId,
    content: input.transcript,
    deviceTranscript: input.transcript || null,
    cloudTranscript: null,
    transcriptSource: "device",
    assignmentStatus: input.assignmentStatus,
    userEdited: false,
    hasAudio: !!input.audioFile,
    audioFile: input.audioFile,
    audioMime: input.audioMime,
    audioDurationMs: input.durationMs,
    recordedAt: input.recordedAt,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  await db.transaction(async (tx) => {
    await writeNoteRow(tx, note);
    await enqueue(tx, "note", note.id);
    if (note.audioFile) await enqueue(tx, "transcribe", note.id);
  });
  return note;
}

export async function addTypedNote(db: SqlDb, skierId: string, content: string): Promise<Note> {
  const now = stamp();
  const note: Note = {
    id: uuid(),
    skierId,
    content,
    deviceTranscript: null,
    cloudTranscript: null,
    transcriptSource: "typed",
    assignmentStatus: "manual",
    userEdited: true,
    hasAudio: false,
    audioFile: null,
    audioMime: null,
    audioDurationMs: null,
    recordedAt: now,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  await db.transaction(async (tx) => {
    await writeNoteRow(tx, note);
    await enqueue(tx, "note", note.id);
  });
  return note;
}

export async function editNoteContent(db: SqlDb, id: string, content: string) {
  await db.transaction(async (tx) => {
    const note = await getNote(tx, id);
    if (!note) throw new Error("Note not found");
    await writeNoteRow(tx, { ...note, content, userEdited: true, updatedAt: stamp() });
    await enqueue(tx, "note", id);
  });
}

export async function assignNote(db: SqlDb, id: string, skierId: string) {
  await db.transaction(async (tx) => {
    const note = await getNote(tx, id);
    if (!note) throw new Error("Note not found");
    await writeNoteRow(tx, { ...note, skierId, assignmentStatus: "manual", updatedAt: stamp() });
    await enqueue(tx, "note", id);
  });
}

// Returns the audio file (if any) so the caller can delete it from disk.
export async function deleteNote(db: SqlDb, id: string): Promise<string | null> {
  return db.transaction(async (tx) => {
    const note = await getNote(tx, id);
    if (!note) return null;
    const now = stamp();
    await writeNoteRow(tx, { ...note, deletedAt: now, updatedAt: now, audioFile: null });
    await enqueue(tx, "note", id);
    await removeOpsForEntity(tx, "transcribe", id);
    return note.audioFile;
  });
}

export async function requestSummary(db: SqlDb, skierId: string): Promise<Summary> {
  const now = stamp();
  const summary: Summary = {
    id: uuid(),
    skierId,
    status: "queued",
    content: null,
    error: null,
    noteCount: null,
    requestedAt: now,
    updatedAt: now,
  };
  await db.transaction(async (tx) => {
    await writeSummaryRow(tx, summary);
    await enqueue(tx, "summary", summary.id);
  });
  return summary;
}

// ---------------------------------------------------------------- sync glue

export function skierPayload(s: Skier): SkierPayload {
  return {
    id: s.id,
    name: s.name,
    level: s.level,
    age: s.age,
    initialNotes: s.initialNotes,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    deletedAt: s.deletedAt,
  };
}

export function notePayload(n: Note): NotePayload {
  return {
    id: n.id,
    skierId: n.skierId,
    content: n.content,
    deviceTranscript: n.deviceTranscript,
    transcriptSource: n.transcriptSource,
    assignmentStatus: n.assignmentStatus,
    userEdited: n.userEdited,
    hasAudio: n.hasAudio,
    audioDurationMs: n.audioDurationMs,
    recordedAt: n.recordedAt,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
    deletedAt: n.deletedAt,
  };
}

// Server rows are applied unless the device has its own unsent change for the
// same row; that change will be pushed, merged on the server and pulled back.
export async function applyServerSkier(tx: SqlExecutor, s: ServerSkier) {
  if (await hasPendingDataOp(tx, "skier", s.id)) return;
  await writeSkierRow(tx, {
    id: s.id,
    name: s.name,
    level: s.level,
    age: s.age,
    initialNotes: s.initialNotes,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    deletedAt: s.deletedAt,
  });
}

export async function applyServerNote(tx: SqlExecutor, n: ServerNote) {
  if (await hasPendingDataOp(tx, "note", n.id)) return;
  const local = await getNote(tx, n.id);
  await writeNoteRow(tx, {
    id: n.id,
    skierId: n.skierId,
    content: n.content,
    deviceTranscript: n.deviceTranscript,
    cloudTranscript: n.cloudTranscript,
    transcriptSource: n.transcriptSource,
    assignmentStatus: n.assignmentStatus,
    userEdited: n.userEdited,
    hasAudio: n.hasAudio,
    // Audio lives only on this device.
    audioFile: n.deletedAt ? null : (local?.audioFile ?? null),
    audioMime: local?.audioMime ?? null,
    audioDurationMs: n.audioDurationMs,
    recordedAt: n.recordedAt,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
    deletedAt: n.deletedAt,
  });
}

export async function applyServerSummary(tx: SqlExecutor, s: ServerSummary) {
  await writeSummaryRow(tx, {
    id: s.id,
    skierId: s.skierId,
    status: s.status,
    content: s.content,
    error: s.error,
    noteCount: s.noteCount,
    requestedAt: s.requestedAt,
    updatedAt: s.serverUpdatedAt,
  });
}

export async function setSummaryStatus(tx: SqlExecutor, id: string, status: LocalSummaryStatus, error: string | null) {
  await tx.run("UPDATE summaries SET status = ?, error = ?, updated_at = ? WHERE id = ?", [status, error, stamp(), id]);
}
