import type { NotePayload, SkierPayload } from "@shared/sync";
import type { NoteRow, SkierRow } from "@shared/schema";

// Pure conflict-resolution rules for rows pushed from a device.
// Last-writer-wins on the device clock (clientUpdatedAt), except for facts only
// the server can know (cloud transcript, AI assignment), which a stale device
// copy must not wipe out.

export type SkierWrite = Omit<SkierRow, "coachId" | "updatedAt" | "photoUpdatedAt">;
export type NoteWrite = Omit<NoteRow, "coachId" | "updatedAt">;

export function mergeSkier(existing: SkierRow | undefined, incoming: SkierPayload): SkierWrite | null {
  const incomingAt = new Date(incoming.updatedAt);
  if (existing && incomingAt < existing.clientUpdatedAt) return null;
  return {
    id: incoming.id,
    name: incoming.name,
    level: incoming.level,
    age: incoming.age,
    initialNotes: incoming.initialNotes,
    createdAt: existing?.createdAt ?? new Date(incoming.createdAt),
    clientUpdatedAt: incomingAt,
    deletedAt: incoming.deletedAt ? new Date(incoming.deletedAt) : null,
    // Older app builds don't send archivedAt; keep whatever the server has.
    archivedAt:
      incoming.archivedAt === undefined
        ? (existing?.archivedAt ?? null)
        : incoming.archivedAt
          ? new Date(incoming.archivedAt)
          : null,
  };
}

const AI_ASSIGNED = new Set(["ai", "ai-uncertain"]);
const WEAK_ASSIGNMENT = new Set(["local-guess", "unassigned"]);

export function mergeNote(existing: NoteRow | undefined, incoming: NotePayload): NoteWrite | null {
  const incomingAt = new Date(incoming.updatedAt);
  if (existing && incomingAt < existing.clientUpdatedAt) return null;

  const write: NoteWrite = {
    id: incoming.id,
    skierId: incoming.skierId,
    content: incoming.content,
    deviceTranscript: incoming.deviceTranscript,
    cloudTranscript: existing?.cloudTranscript ?? null,
    transcriptSource: incoming.transcriptSource,
    assignmentStatus: incoming.assignmentStatus,
    userEdited: incoming.userEdited,
    hasAudio: incoming.hasAudio || (existing?.hasAudio ?? false),
    audioDurationMs: incoming.audioDurationMs ?? existing?.audioDurationMs ?? null,
    recordedAt: new Date(incoming.recordedAt),
    createdAt: existing?.createdAt ?? new Date(incoming.createdAt),
    clientUpdatedAt: incomingAt,
    deletedAt: incoming.deletedAt ? new Date(incoming.deletedAt) : null,
  };

  if (!existing) return write;

  // The device still holds its on-device transcript but the server already has
  // the better cloud one; keep the cloud text unless the coach typed changes.
  if (
    existing.transcriptSource === "cloud" &&
    incoming.transcriptSource === "device" &&
    !incoming.userEdited
  ) {
    write.content = existing.content;
    write.transcriptSource = existing.transcriptSource;
  }

  // The AI already matched this note to a skier; a device that only had a
  // local name guess (or nothing) must not undo that. A manual choice wins.
  if (AI_ASSIGNED.has(existing.assignmentStatus) && WEAK_ASSIGNMENT.has(incoming.assignmentStatus)) {
    write.skierId = existing.skierId;
    write.assignmentStatus = existing.assignmentStatus;
  }

  return write;
}
