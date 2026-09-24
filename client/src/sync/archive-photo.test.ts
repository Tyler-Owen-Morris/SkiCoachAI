import { describe, expect, it } from "vitest";
import { outboxCounts } from "@/data/outbox";
import {
  createSkier,
  getNote,
  getSkierPhoto,
  listArchivedSkiers,
  listNotesForSkier,
  listSkiers,
  saveVoiceNote,
  setSkierArchived,
  setSkierPhoto,
} from "@/data/repo";
import { guessSkier } from "@/lib/name-match";
import { FakeServer, makeEngine, memoryDb } from "./test-helpers";

const lisa = { name: "Lisa Park", level: "intermediate" as const, age: 25, initialNotes: null };
const photo = { photo: "data:image/jpeg;base64,AAAA", thumb: "data:image/jpeg;base64,BBBB" };

describe("archiving skiers", () => {
  it("keeps notes but drops the skier from the active roster used for matching", async () => {
    const db = await memoryDb();
    const oldLisa = await createSkier(db, { ...lisa, name: "Lisa" });
    const newLisa = await createSkier(db, { ...lisa, name: "Lisa" });
    await saveVoiceNote(db, {
      skierId: oldLisa.id,
      assignmentStatus: "manual",
      transcript: "Lisa carved well",
      audioFile: null,
      audioMime: null,
      durationMs: null,
      recordedAt: new Date().toISOString(),
    });

    // Two active skiers called Lisa: too ambiguous to guess.
    expect(guessSkier("Lisa needs more edge angle", await listSkiers(db))).toBeNull();

    await setSkierArchived(db, oldLisa.id, true);
    const active = await listSkiers(db);
    expect(active.map((s) => s.id)).toEqual([newLisa.id]);
    expect((await listArchivedSkiers(db)).map((s) => s.id)).toEqual([oldLisa.id]);
    // Only the active Lisa is considered now.
    expect(guessSkier("Lisa needs more edge angle", active)?.id).toBe(newLisa.id);
    // The archived skier's notes are untouched.
    expect(await listNotesForSkier(db, oldLisa.id)).toHaveLength(1);

    await setSkierArchived(db, oldLisa.id, false);
    expect(await listSkiers(db)).toHaveLength(2);
  });

  it("syncs archive state to the server and back to a second phone", async () => {
    const server = new FakeServer();
    const phoneA = await memoryDb();
    const { engine: a } = makeEngine(phoneA, server);
    const skier = await createSkier(phoneA, lisa);
    await setSkierArchived(phoneA, skier.id, true);
    await a.requestSync();
    expect(server.skiers.get(skier.id)?.archivedAt).toBeInstanceOf(Date);

    const phoneB = await memoryDb();
    const { engine: b } = makeEngine(phoneB, server);
    await b.requestSync();
    expect(await listSkiers(phoneB)).toHaveLength(0);
    expect((await listArchivedSkiers(phoneB)).map((s) => s.name)).toEqual(["Lisa Park"]);
  });
});

describe("skier photos", () => {
  it("uploads a photo taken offline after the skier, and a reinstalled phone downloads it", async () => {
    const server = new FakeServer();
    server.online = false;
    const phone = await memoryDb();
    const { engine, clock } = makeEngine(phone, server);
    const skier = await createSkier(phone, lisa, photo);
    await engine.requestSync();
    expect((await outboxCounts(phone)).pending).toBe(2);
    expect((await listSkiers(phone))[0].thumb).toBe(photo.thumb);

    server.online = true;
    clock.now += 60_000;
    await engine.flushNow();
    expect((await outboxCounts(phone)).pending).toBe(0);
    expect(server.photos.get(skier.id)?.photo).toBe(photo.photo);

    const reinstalled = await memoryDb();
    const { engine: fresh } = makeEngine(reinstalled, server);
    await fresh.requestSync();
    expect((await getSkierPhoto(reinstalled, skier.id))?.photo).toBe(photo.photo);
    expect((await listSkiers(reinstalled))[0].thumb).toBe(photo.thumb);
  });

  it("syncs a removed photo and never overwrites a newer local photo with an older download", async () => {
    const server = new FakeServer();
    const phone = await memoryDb();
    const { engine } = makeEngine(phone, server);
    const skier = await createSkier(phone, lisa, photo);
    await engine.requestSync();

    await setSkierPhoto(phone, skier.id, null);
    await engine.requestSync();
    expect(server.photos.get(skier.id)?.photo).toBeNull();
    expect((await getSkierPhoto(phone, skier.id))?.photo).toBeNull();

    // Local change queued while offline stays even though a pull runs.
    server.online = false;
    const newer = { photo: "data:image/jpeg;base64,CCCC", thumb: "data:image/jpeg;base64,DDDD" };
    await setSkierPhoto(phone, skier.id, newer);
    server.online = true;
    await engine.flushNow();
    expect((await getSkierPhoto(phone, skier.id))?.photo).toBe(newer.photo);
    expect(server.photos.get(skier.id)?.photo).toBe(newer.photo);
    expect(await getNote(phone, "none")).toBeNull();
  });
});
