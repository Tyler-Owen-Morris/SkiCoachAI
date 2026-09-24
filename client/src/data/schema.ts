import type { SqlDb } from "./sql";

// On-device schema. The phone is the source of truth for everything the coach
// sees; the server is a sync target. Timestamps are ISO strings, except outbox
// scheduling fields which are epoch milliseconds.
const MIGRATIONS: string[] = [
  `
  CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT);

  CREATE TABLE IF NOT EXISTS skiers (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    level TEXT NOT NULL,
    age INTEGER,
    initial_notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY NOT NULL,
    skier_id TEXT,
    content TEXT NOT NULL,
    device_transcript TEXT,
    cloud_transcript TEXT,
    transcript_source TEXT NOT NULL,
    assignment_status TEXT NOT NULL,
    user_edited INTEGER NOT NULL DEFAULT 0,
    has_audio INTEGER NOT NULL DEFAULT 0,
    audio_file TEXT,
    audio_mime TEXT,
    audio_duration_ms INTEGER,
    recorded_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE INDEX IF NOT EXISTS notes_skier_idx ON notes (skier_id, recorded_at);

  CREATE TABLE IF NOT EXISTS summaries (
    id TEXT PRIMARY KEY NOT NULL,
    skier_id TEXT NOT NULL,
    status TEXT NOT NULL,
    content TEXT,
    error TEXT,
    note_count INTEGER,
    requested_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS summaries_skier_idx ON summaries (skier_id, requested_at);

  CREATE TABLE IF NOT EXISTS outbox (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    op_id TEXT NOT NULL UNIQUE,
    lane TEXT NOT NULL,
    kind TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS outbox_lane_idx ON outbox (lane, state, seq);
  `,
  // 2: archiving and skier photos. photo_updated_at on skiers is the server's
  // photo version; skier_photos.updated_at is the version this phone holds.
  `
  ALTER TABLE skiers ADD COLUMN archived_at TEXT;
  ALTER TABLE skiers ADD COLUMN photo_updated_at TEXT;
  CREATE TABLE IF NOT EXISTS skier_photos (
    skier_id TEXT PRIMARY KEY NOT NULL,
    photo TEXT,
    thumb TEXT,
    updated_at TEXT NOT NULL
  );
  `,
];

export async function migrate(db: SqlDb) {
  await db.exec("CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT);");
  const [row] = await db.all<{ value: string }>("SELECT value FROM kv WHERE key = 'schema_version'");
  let version = row ? parseInt(row.value, 10) : 0;
  while (version < MIGRATIONS.length) {
    const sql = MIGRATIONS[version];
    const next = version + 1;
    await db.transaction(async (tx) => {
      for (const statement of sql.split(";").map((s) => s.trim()).filter(Boolean)) {
        await tx.run(statement);
      }
      await tx.run("INSERT OR REPLACE INTO kv (key, value) VALUES ('schema_version', ?)", [String(next)]);
    });
    version = next;
  }
  // Ops that were mid-flight when the app was killed go back in the queue.
  await db.run("UPDATE outbox SET state = 'pending' WHERE state = 'inflight'");
}
