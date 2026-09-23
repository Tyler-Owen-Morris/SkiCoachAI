import { describe, expect, it } from "vitest";
import type { NoteRow } from "@shared/schema";
import type { NotePayload } from "@shared/sync";
import { mergeNote } from "./merge";

const t = (s: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, s));

const existing: NoteRow = {
  id: "note-0001",
  coachId: "c",
  skierId: "skier-ai",
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
