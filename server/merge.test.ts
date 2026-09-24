import { describe, expect, it } from "vitest";
import type { NoteRow, SkierRow } from "@shared/schema";
import type { NotePayload } from "@shared/sync";
import { mergeNote, mergeSkier } from "./merge";

const t = (s: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, s));

const existing: NoteRow = {
  id: "note-0001",
  coachId: "c",
  skierId: "skier-ai",
  equipment: "ski",
  content: "cloud text",
  deviceTranscript: "device text",
  cloudTranscript: "cloud text",
  transcriptSource: "cloud",
  assignmentStatus: "ai",
  userEdited: false,
  hasAudio: true,
  audioDurationMs: 3000,
  recordedAt: t(0),
  createdAt: t(0),
  clientUpdatedAt: t(10),
  updatedAt: t(20),
  deletedAt: null,
};

const incoming = (patch: Partial<NotePayload>): NotePayload => ({
  id: "note-0001",
  skierId: "skier-guess",
  content: "device text",
  deviceTranscript: "device text",
  transcriptSource: "device",
  assignmentStatus: "local-guess",
  userEdited: false,
  hasAudio: true,
  audioDurationMs: 3000,
  recordedAt: t(0).toISOString(),
  createdAt: t(0).toISOString(),
  updatedAt: t(30).toISOString(),
  deletedAt: null,
  ...patch,
});

describe("mergeNote", () => {
  it("ignores a stale device copy", () => {
    expect(mergeNote(existing, incoming({ updatedAt: t(5).toISOString() }))).toBeNull();
  });

  it("keeps the cloud transcript and AI assignment over an old device guess", () => {
    const w = mergeNote(existing, incoming({}))!;
    expect(w.content).toBe("cloud text");
    expect(w.transcriptSource).toBe("cloud");
    expect(w.skierId).toBe("skier-ai");
    expect(w.assignmentStatus).toBe("ai");
    expect(w.cloudTranscript).toBe("cloud text");
  });

  it("lets the coach's edits and manual assignment win", () => {
    const w = mergeNote(
      existing,
      incoming({ content: "typed fix", userEdited: true, skierId: "skier-manual", assignmentStatus: "manual" }),
    )!;
    expect(w.content).toBe("typed fix");
    expect(w.skierId).toBe("skier-manual");
    expect(w.assignmentStatus).toBe("manual");
  });

  it("applies deletes", () => {
    const w = mergeNote(existing, incoming({ deletedAt: t(30).toISOString() }))!;
    expect(w.deletedAt?.toISOString()).toBe(t(30).toISOString());
  });
});

describe("mergeSkier", () => {
  const archivedRow: SkierRow = {
    id: "skier-0001",
    coachId: "c",
    name: "Lisa",
    level: "intermediate",
    age: 25,
    initialNotes: null,
    createdAt: t(0),
    clientUpdatedAt: t(10),
    updatedAt: t(20),
    deletedAt: null,
    archivedAt: t(10),
    photoUpdatedAt: null,
  };
  const payload = {
    id: "skier-0001",
    name: "Lisa P",
    level: "intermediate" as const,
    age: 25,
    initialNotes: null,
    createdAt: t(0).toISOString(),
    updatedAt: t(30).toISOString(),
    deletedAt: null,
  };

  it("keeps a skier archived when an older app build (no archivedAt field) edits it", () => {
    expect(mergeSkier(archivedRow, payload)?.archivedAt).toEqual(t(10));
  });

  it("unarchives when a current build sends archivedAt: null", () => {
    expect(mergeSkier(archivedRow, { ...payload, archivedAt: null })?.archivedAt).toBeNull();
  });
});

describe("equipment", () => {
  it("keeps the server's equipment when an older app build (no equipment field) edits a note", () => {
    const boardNote = { ...existing, equipment: "snowboard", assignmentStatus: "manual" };
    const w = mergeNote(boardNote, incoming({ assignmentStatus: "manual", skierId: "skier-ai" }))!;
    expect(w.equipment).toBe("snowboard");
  });

  it("takes the equipment from the device when it's sent", () => {
    const w = mergeNote({ ...existing, equipment: "ski" }, incoming({ equipment: "snowboard", assignmentStatus: "manual" }))!;
    expect(w.equipment).toBe("snowboard");
  });

  it("keeps the AI assignment's equipment over a stale device guess", () => {
    const aiBoard = { ...existing, equipment: "snowboard" };
    const w = mergeNote(aiBoard, incoming({ equipment: "ski" }))!;
    expect(w.skierId).toBe("skier-ai");
    expect(w.equipment).toBe("snowboard");
  });
});
