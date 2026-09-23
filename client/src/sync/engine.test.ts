import { describe, expect, it } from "vitest";
import { allOps, outboxCounts } from "@/data/outbox";
import { migrate } from "@/data/schema";
import {
  addTypedNote,
  assignNote,
  createSkier,
  editNoteContent,
  deleteSkier,
  getNote,
  latestSummary,
  listInboxNotes,
  listNotesForSkier,
  requestSummary,
  saveVoiceNote,
  updateSkier,
} from "@/data/repo";
import { backoffMs } from "./engine";
import { FakeServer, makeEngine, memoryDb } from "./test-helpers";

const skierInput = { name: "Jake Moss", level: "intermediate" as const, age: 12, initialNotes: null };

function voiceNote(skierId: string | null, transcript = "jake nice angulation") {
  return {
    skierId,
    assignmentStatus: skierId ? ("local-guess" as const) : ("unassigned" as const),
    transcript,
    audioFile: "rec.m4a",
    audioMime: "audio/mp4",
    durationMs: 4000,
    recordedAt: new Date().toISOString(),
  };
}

describe("sync engine", () => {
  it("keeps a long offline backlog and flushes it in order when signal returns", async () => {
    const db = await memoryDb();
    const server = new FakeServer();
    server.online = false;
    const { engine, clock } = makeEngine(db, server);

    const skier = await createSkier(db, skierInput);
    for (let i = 0; i < 40; i++) await addTypedNote(db, skier.id, `note ${i}`);

    // Hours of failed attempts on a dead connection.
    for (let i = 0; i < 30; i++) {
      await engine.requestSync();
      clock.now += 10 * 60_000;
    }
    expect((await outboxCounts(db)).pending).toBe(41);
    expect(server.notes.size).toBe(0);
    const [head] = await allOps(db);
    expect(head.attempts).toBeGreaterThan(5);
    expect(head.state).toBe("pending");

    server.online = true;
    await engine.flushNow();

    expect((await outboxCounts(db)).pending).toBe(0);
    expect(server.skiers.has(skier.id)).toBe(true);
    expect(server.notes.size).toBe(40);
    expect(engine.getStatus().lastError).toBeNull();
  });

  it("caps backoff at five minutes and never gives up", () => {
    expect(backoffMs(0, "network", 0.5)).toBe(2000);
    expect(backoffMs(3, "network", 0.5)).toBe(16000);
    expect(backoffMs(50, "network", 0.5)).toBe(5 * 60_000);
    expect(backoffMs(50, "network", 1)).toBeLessThanOrEqual(6 * 60_000);
  });

  it("does not duplicate when the server applied a push but the response was lost", async () => {
    const db = await memoryDb();
    const server = new FakeServer();
    const { engine, clock } = makeEngine(db, server);
    const skier = await createSkier(db, skierInput);
    await addTypedNote(db, skier.id, "hello");

    server.loseNextResponse = true;
    await engine.requestSync();
    expect((await outboxCounts(db)).pending).toBe(2);

    clock.now += 60_000;
    await engine.requestSync();
    expect((await outboxCounts(db)).pending).toBe(0);
    expect(server.notes.size).toBe(1);
    expect(server.skiers.size).toBe(1);
  });

  it("collapses many offline edits to one row into a single upload", async () => {
    const db = await memoryDb();
    const server = new FakeServer();
    const { engine } = makeEngine(db, server);
    const skier = await createSkier(db, skierInput);
    for (let i = 0; i < 10; i++) await updateSkier(db, skier.id, { ...skierInput, name: `Jake ${i}` });
    expect((await outboxCounts(db)).pending).toBe(1);
    await engine.requestSync();
    expect(server.skiers.get(skier.id)?.name).toBe("Jake 9");
  });

  it("puts ops that were mid-flight when the app was killed back in the queue", async () => {
    const db = await memoryDb();
    await createSkier(db, skierInput);
    await db.run("UPDATE outbox SET state = 'inflight'");
    await migrate(db); // runs at every app start
    const [op] = await allOps(db);
    expect(op.state).toBe("pending");
  });

  it("pauses (without losing anything) when the sign-in expires", async () => {
    const db = await memoryDb();
    const server = new FakeServer();
    const { engine } = makeEngine(db, server);
    await createSkier(db, skierInput);
    server.failures = [401];
    await engine.requestSync();
    expect(engine.getStatus().authExpired).toBe(true);
    expect((await outboxCounts(db)).pending).toBe(1);

    await engine.onSignedIn();
    expect((await outboxCounts(db)).pending).toBe(0);
  });

  it("parks a rejected op for review and keeps syncing the rest", async () => {
    const db = await memoryDb();
    const server = new FakeServer();
    const { engine } = makeEngine(db, server);
    await createSkier(db, { ...skierInput, name: "REJECT" });
    const good = await createSkier(db, skierInput);
    await engine.requestSync();
    const counts = await outboxCounts(db);
    expect(counts.failed).toBe(1);
    expect(counts.pending).toBe(0);
    expect(server.skiers.has(good.id)).toBe(true);
  });

  it("uploads a voice note, then swaps in the cloud transcript and AI assignment", async () => {
    const db = await memoryDb();
    const server = new FakeServer();
    const { engine } = makeEngine(db, server);
    const skier = await createSkier(db, skierInput);
    const note = await saveVoiceNote(db, voiceNote(null));
    server.assignTo = skier.id;
    server.transcriptFor = () => "Jake: nice angulation on the groomer";

    await engine.requestSync();

    const local = await getNote(db, note.id);
    expect(local?.content).toBe("Jake: nice angulation on the groomer");
    expect(local?.deviceTranscript).toBe("jake nice angulation");
    expect(local?.transcriptSource).toBe("cloud");
    expect(local?.skierId).toBe(skier.id);
    expect(local?.assignmentStatus).toBe("ai");
    expect(local?.audioFile).toBe("rec.m4a");
    expect((await outboxCounts(db)).aiPending).toBe(0);
  });

  it("keeps the coach's edits and manual assignment over later cloud results", async () => {
    const db = await memoryDb();
    const server = new FakeServer();
    server.online = false;
    const { engine, clock } = makeEngine(db, server);
    const a = await createSkier(db, skierInput);
    const b = await createSkier(db, { ...skierInput, name: "Beth Ray" });
    const note = await saveVoiceNote(db, voiceNote(a.id));
    await editNoteContent(db, note.id, "Coach's corrected text");
    await assignNote(db, note.id, b.id);

    server.online = true;
    server.assignTo = a.id;
    clock.now += 60_000;
    await engine.flushNow();

    const local = await getNote(db, note.id);
    expect(local?.content).toBe("Coach's corrected text");
    expect(local?.cloudTranscript).toBe("cloud transcript");
    expect(local?.skierId).toBe(b.id);
    expect(local?.assignmentStatus).toBe("manual");
  });

  it("holds AI work while the OpenAI key is bad, then finishes once it's fixed", async () => {
    const db = await memoryDb();
    const server = new FakeServer();
    const { engine, clock } = makeEngine(db, server);
    const skier = await createSkier(db, skierInput);
    await addTypedNote(db, skier.id, "good edging");
    const summary = await requestSummary(db, skier.id);

    // Summary calls fail with a key problem until the key is fixed.
    const realSummary = server.api.summary;
    server.api.summary = async () => {
      server.failures = [424];
      return realSummary(skier.id, summary.id, summary.requestedAt);
    };
    await engine.requestSync();
    expect(server.skiers.size).toBe(1);
    expect(engine.getStatus().aiKeyProblem).toBeTruthy();
    expect((await latestSummary(db, skier.id))?.status).toBe("queued");
    expect((await outboxCounts(db)).aiPending).toBe(1);

    server.api.summary = realSummary;
    clock.now += 60_000;
    await engine.onKeyChanged();
    const done = await latestSummary(db, skier.id);
    expect(done?.status).toBe("ready");
    expect(done?.content?.nextFocus).toBe("edging");
    expect(engine.getStatus().aiKeyProblem).toBeNull();
  });

  it("pulls notes created elsewhere but never overwrites an unsent local edit", async () => {
    const db = await memoryDb();
    const server = new FakeServer();
    const { engine, clock } = makeEngine(db, server);
    const skier = await createSkier(db, skierInput);
    const note = await addTypedNote(db, skier.id, "v1");
    await engine.requestSync();

    // Server-side change (e.g. from another device) plus a local unsent edit.
    const row = server.notes.get(note.id)!;
    server.notes.set(note.id, { ...row, content: "server v2", updatedAt: new Date(server.tick + 5000) });
    server.tick += 5000;
    server.online = false;
    await editNoteContent(db, note.id, "local v3");
    await engine.requestSync();
    expect((await getNote(db, note.id))?.content).toBe("local v3");

    server.online = true;
    clock.now += 60_000;
    await engine.flushNow();
    // Local edit is newer, so it wins everywhere.
    expect((await getNote(db, note.id))?.content).toBe("local v3");
    expect(server.notes.get(note.id)?.content).toBe("local v3");
    expect((await listNotesForSkier(db, skier.id)).length).toBe(1);
  });

  it("does nothing on the network until the coach signs in, but keeps the work", async () => {
    const db = await memoryDb();
    const server = new FakeServer();
    let signedIn = false;
    const { engine } = makeEngine(db, server, { signedIn: () => signedIn });
    await createSkier(db, skierInput);
    await engine.requestSync();
    expect(server.pushCalls).toBe(0);
    expect(engine.getStatus().pending).toBe(1);
    signedIn = true;
    await engine.onSignedIn();
    expect(server.skiers.size).toBe(1);
  });

  it("waits out the head op's backoff instead of spinning on the ops queued behind it", async () => {
    const db = await memoryDb();
    const server = new FakeServer();
    server.online = false;
    const delays: number[] = [];
    const { engine } = makeEngine(db, server, { onTimer: (ms) => delays.push(ms) });
    const skier = await createSkier(db, skierInput);
    await addTypedNote(db, skier.id, "a");
    await saveVoiceNote(db, voiceNote(skier.id));

    await engine.requestSync();
    // Head backs off ~2s; the queued notes (next_attempt_at 0) must not
    // trigger a 250ms wake-up loop that also hammers pull.
    expect(delays.at(-1)).toBeGreaterThanOrEqual(1500);
  });

  it("backs off when the server omits results for some ops", async () => {
    const db = await memoryDb();
    const server = new FakeServer();
    const delays: number[] = [];
    const { engine } = makeEngine(db, server, { onTimer: (ms) => delays.push(ms) });
    const realPush = server.api.push;
    server.api.push = async (ops) => {
      const res = await realPush(ops);
      return { results: res.results.slice(0, 1) };
    };
    const skier = await createSkier(db, skierInput);
    await addTypedNote(db, skier.id, "a");

    await engine.requestSync();
    const [op] = await allOps(db);
    expect(op.state).toBe("pending");
    expect(op.attempts).toBe(1);
    expect(delays.at(-1)).toBeGreaterThanOrEqual(1500);
  });

  it("shows notes filed under a removed skier in the inbox instead of hiding them", async () => {
    const db = await memoryDb();
    const server = new FakeServer();
    const { engine } = makeEngine(db, server);
    const gone = await createSkier(db, skierInput);
    const note = await saveVoiceNote(db, voiceNote(null));
    server.assignTo = gone.id;
    await engine.requestSync(); // AI files the note under the skier on the server
    await deleteSkier(db, gone.id);
    // Server kept the AI assignment (the phone only pushed the skier delete).
    await engine.requestSync();
    const inbox = await listInboxNotes(db);
    expect(inbox.map((n) => n.id)).toContain(note.id);
  });
});
