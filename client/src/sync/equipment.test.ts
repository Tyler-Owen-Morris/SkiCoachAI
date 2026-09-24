import { describe, expect, it } from "vitest";
import {
  assignNote,
  createSkier,
  latestSummary,
  listNotesForSkier,
  noteCountsByEquipment,
  requestSummary,
  saveVoiceNote,
  setNoteEquipment,
} from "@/data/repo";
import { FakeServer, makeEngine, memoryDb } from "./test-helpers";

const sam = { name: "Sam Lee", level: "advanced" as const, age: 14, initialNotes: null, equipment: "snowboard" as const };

function note(skierId: string | null, equipment: "ski" | "snowboard", transcript: string) {
  return {
    skierId,
    equipment,
    assignmentStatus: skierId ? ("manual" as const) : ("unassigned" as const),
    transcript,
    audioFile: null,
    audioMime: null,
    durationMs: null,
    recordedAt: new Date().toISOString(),
  };
}

describe("ski vs snowboard", () => {
  it("keeps ski and snowboard notes and summaries apart, and syncs them to another phone", async () => {
    const server = new FakeServer();
    const phone = await memoryDb();
    const { engine } = makeEngine(phone, server);
    const skier = await createSkier(phone, sam);
    await saveVoiceNote(phone, note(skier.id, "snowboard", "heel edge chatter"));
    await saveVoiceNote(phone, note(skier.id, "snowboard", "good ollie"));
    await saveVoiceNote(phone, note(skier.id, "ski", "pole plant late"));

    expect((await listNotesForSkier(phone, skier.id, "snowboard")).map((n) => n.content).sort()).toEqual([
      "good ollie",
      "heel edge chatter",
    ]);
    expect((await listNotesForSkier(phone, skier.id, "ski")).map((n) => n.content)).toEqual(["pole plant late"]);
    expect(await noteCountsByEquipment(phone, skier.id)).toEqual({ ski: 1, snowboard: 2 });

    await requestSummary(phone, skier.id, "snowboard");
    await engine.requestSync();
    const board = await latestSummary(phone, skier.id, "snowboard");
    expect(board?.status).toBe("ready");
    expect(board?.noteCount).toBe(2);
    expect(await latestSummary(phone, skier.id, "ski")).toBeNull();

    const other = await memoryDb();
    const { engine: b } = makeEngine(other, server);
    await b.requestSync();
    expect(await noteCountsByEquipment(other, skier.id)).toEqual({ ski: 1, snowboard: 2 });
    expect((await latestSummary(other, skier.id, "snowboard"))?.equipment).toBe("snowboard");
  });

  it("files an inbox note under the equipment of the skier it's assigned to", async () => {
    const db = await memoryDb();
    const skier = await createSkier(db, sam);
    const n = await saveVoiceNote(db, note(null, "ski", "nice carve"));
    await assignNote(db, n.id, skier.id);
    expect((await listNotesForSkier(db, skier.id, "snowboard")).map((x) => x.id)).toEqual([n.id]);
  });

  it("moves a note between the ski and snowboard sets and syncs the move", async () => {
    const server = new FakeServer();
    const db = await memoryDb();
    const { engine } = makeEngine(db, server);
    const skier = await createSkier(db, sam);
    const n = await saveVoiceNote(db, note(skier.id, "snowboard", "was on skis today actually"));
    await setNoteEquipment(db, n.id, "ski");
    await engine.requestSync();
    expect(await noteCountsByEquipment(db, skier.id)).toEqual({ ski: 1, snowboard: 0 });
    expect(server.notes.get(n.id)?.equipment).toBe("ski");
  });
});
