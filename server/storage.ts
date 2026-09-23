import { and, asc, eq, gt, inArray, isNull } from "drizzle-orm";
import {
  coaches,
  notes,
  skiers,
  summaries,
  type NoteRow,
  type SkierRow,
  type SummaryRow,
} from "@shared/schema";
import type { AuthMode, ServerNote, ServerSkier, ServerSummary, SummaryContent } from "@shared/sync";
import { db } from "./db";
import type { NoteWrite, SkierWrite } from "./merge";

const PULL_LIMIT = 5000;

export function toServerSkier(row: SkierRow): ServerSkier {
  return {
    id: row.id,
    name: row.name,
    level: row.level as ServerSkier["level"],
    age: row.age,
    initialNotes: row.initialNotes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.clientUpdatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
    serverUpdatedAt: row.updatedAt.toISOString(),
  };
}

export function toServerNote(row: NoteRow): ServerNote {
  return {
    id: row.id,
    skierId: row.skierId,
    content: row.content,
    deviceTranscript: row.deviceTranscript,
    cloudTranscript: row.cloudTranscript,
    transcriptSource: row.transcriptSource as ServerNote["transcriptSource"],
    assignmentStatus: row.assignmentStatus as ServerNote["assignmentStatus"],
    userEdited: row.userEdited,
    hasAudio: row.hasAudio,
    audioDurationMs: row.audioDurationMs,
    recordedAt: row.recordedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.clientUpdatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
    serverUpdatedAt: row.updatedAt.toISOString(),
  };
}

export function toServerSummary(row: SummaryRow): ServerSummary {
  let content: SummaryContent | null = null;
  if (row.content) {
    try {
      content = JSON.parse(row.content) as SummaryContent;
    } catch {
      content = null;
    }
  }
  return {
    id: row.id,
    skierId: row.skierId,
    status: row.status as ServerSummary["status"],
    content,
    error: row.error,
    noteCount: row.noteCount,
    requestedAt: row.requestedAt.toISOString(),
    serverUpdatedAt: row.updatedAt.toISOString(),
  };
}

export const storage = {
  async upsertCoach(id: string, authMode: AuthMode) {
    await db
      .insert(coaches)
      .values({ id, authMode })
      .onConflictDoUpdate({ target: coaches.id, set: { authMode, lastSeenAt: new Date() } });
  },

  async touchCoach(id: string, authMode: AuthMode) {
    await db
      .insert(coaches)
      .values({ id, authMode })
      .onConflictDoUpdate({ target: coaches.id, set: { lastSeenAt: new Date() } });
  },

  async getSkier(id: string) {
    const [row] = await db.select().from(skiers).where(eq(skiers.id, id));
    return row;
  },

  async writeSkier(coachId: string, write: SkierWrite) {
    const values = { ...write, coachId, updatedAt: new Date() };
    await db.insert(skiers).values(values).onConflictDoUpdate({ target: skiers.id, set: values });
  },

  async getNote(id: string) {
    const [row] = await db.select().from(notes).where(eq(notes.id, id));
    return row;
  },

  async writeNote(coachId: string, write: NoteWrite) {
    const values = { ...write, coachId, updatedAt: new Date() };
    const [row] = await db
      .insert(notes)
      .values(values)
      .onConflictDoUpdate({ target: notes.id, set: values })
      .returning();
    return row;
  },

  // Server-side edits (AI results) keep clientUpdatedAt unchanged so a newer
  // edit from the coach still wins, but bump updatedAt so devices pull them.
  async patchNote(id: string, patch: Partial<Omit<NoteRow, "id" | "coachId" | "updatedAt">>) {
    const [row] = await db
      .update(notes)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(notes.id, id))
      .returning();
    return row;
  },

  async activeRoster(coachId: string) {
    return db
      .select({ id: skiers.id, name: skiers.name })
      .from(skiers)
      .where(and(eq(skiers.coachId, coachId), isNull(skiers.deletedAt)));
  },

  async activeNotesForSkier(coachId: string, skierId: string) {
    return db
      .select()
      .from(notes)
      .where(and(eq(notes.coachId, coachId), eq(notes.skierId, skierId), isNull(notes.deletedAt)))
      .orderBy(asc(notes.recordedAt));
  },

  async getSummary(id: string) {
    const [row] = await db.select().from(summaries).where(eq(summaries.id, id));
    return row;
  },

  async writeSummary(row: Omit<SummaryRow, "updatedAt">) {
    const values = { ...row, updatedAt: new Date() };
    const [saved] = await db
      .insert(summaries)
      .values(values)
      .onConflictDoUpdate({ target: summaries.id, set: values })
      .returning();
    return saved;
  },

  async changesSince(coachId: string, since: Date | null) {
    const skierWhere = since
      ? and(eq(skiers.coachId, coachId), gt(skiers.updatedAt, since))
      : eq(skiers.coachId, coachId);
    const noteWhere = since
      ? and(eq(notes.coachId, coachId), gt(notes.updatedAt, since))
      : eq(notes.coachId, coachId);
    const summaryWhere = since
      ? and(eq(summaries.coachId, coachId), gt(summaries.updatedAt, since))
      : eq(summaries.coachId, coachId);
    const [skierRows, noteRows, summaryRows] = await Promise.all([
      db.select().from(skiers).where(skierWhere).orderBy(asc(skiers.updatedAt)).limit(PULL_LIMIT),
      db.select().from(notes).where(noteWhere).orderBy(asc(notes.updatedAt)).limit(PULL_LIMIT),
      db.select().from(summaries).where(summaryWhere).orderBy(asc(summaries.updatedAt)).limit(PULL_LIMIT),
    ]);
    return { skierRows, noteRows, summaryRows, limit: PULL_LIMIT };
  },

  async skiersByIds(ids: string[]) {
    if (ids.length === 0) return [];
    return db.select().from(skiers).where(inArray(skiers.id, ids));
  },
};
