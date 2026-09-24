import {
  boolean,
  index,
  integer,
  pgSchema,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

// All tables live in their own Postgres schema so they never collide with
// tables left over from the original Replit version of the app.
export const skicoach = pgSchema("skicoach");

// A coach account. The id is the device id generated on the phone, so the
// same device always maps back to the same account after re-login.
export const coaches = skicoach.table("coaches", {
  id: varchar("id", { length: 64 }).primaryKey(),
  authMode: varchar("auth_mode", { length: 16 }).notNull(), // passcode | byok
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
});

// Every syncable row has:
//  - an id generated on the device (so retries are idempotent)
//  - clientUpdatedAt: the last-writer-wins clock (device time of the edit)
//  - updatedAt: server time of the last write, used as the pull cursor
//  - deletedAt: tombstone so deletes sync like any other change
export const skiers = skicoach.table(
  "skiers",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    coachId: varchar("coach_id", { length: 64 }).notNull().references(() => coaches.id),
    name: text("name").notNull(),
    level: varchar("level", { length: 32 }).notNull(),
    age: integer("age"),
    initialNotes: text("initial_notes"),
    // What they're currently riding: ski | snowboard. Notes and summaries each
    // carry their own equipment so the two are kept apart.
    equipment: varchar("equipment", { length: 16 }).notNull().default("ski"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    clientUpdatedAt: timestamp("client_updated_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    // Archived skiers keep their notes but are left out of voice-note matching.
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    // Device clock of the latest photo upload (the photo is in skier_photos).
    photoUpdatedAt: timestamp("photo_updated_at", { withTimezone: true }),
  },
  (t) => [index("skiers_coach_updated_idx").on(t.coachId, t.updatedAt)],
);

// Kept apart from skiers so syncing skier rows never drags image data along.
// photo/thumb are JPEG data URLs; both null means the photo was removed.
export const skierPhotos = skicoach.table("skier_photos", {
  skierId: varchar("skier_id", { length: 64 }).primaryKey(),
  coachId: varchar("coach_id", { length: 64 }).notNull().references(() => coaches.id),
  photo: text("photo"),
  thumb: text("thumb"),
  clientUpdatedAt: timestamp("client_updated_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notes = skicoach.table(
  "notes",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    coachId: varchar("coach_id", { length: 64 }).notNull().references(() => coaches.id),
    // Null while a voice note has not been matched to a skier yet.
    skierId: varchar("skier_id", { length: 64 }),
    equipment: varchar("equipment", { length: 16 }).notNull().default("ski"), // ski | snowboard
    content: text("content").notNull(),
    deviceTranscript: text("device_transcript"),
    cloudTranscript: text("cloud_transcript"),
    transcriptSource: varchar("transcript_source", { length: 16 }).notNull(), // device | cloud | typed
    assignmentStatus: varchar("assignment_status", { length: 16 }).notNull(), // manual | local-guess | ai | ai-uncertain | unassigned
    userEdited: boolean("user_edited").notNull().default(false),
    hasAudio: boolean("has_audio").notNull().default(false),
    audioDurationMs: integer("audio_duration_ms"),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    clientUpdatedAt: timestamp("client_updated_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("notes_coach_updated_idx").on(t.coachId, t.updatedAt),
    index("notes_skier_idx").on(t.skierId),
  ],
);

export const summaries = skicoach.table(
  "summaries",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    coachId: varchar("coach_id", { length: 64 }).notNull().references(() => coaches.id),
    skierId: varchar("skier_id", { length: 64 }).notNull(),
    equipment: varchar("equipment", { length: 16 }).notNull().default("ski"), // ski | snowboard
    status: varchar("status", { length: 16 }).notNull(), // pending | ready | error
    content: text("content"), // JSON string of SummaryContent
    error: text("error"),
    noteCount: integer("note_count"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("summaries_coach_updated_idx").on(t.coachId, t.updatedAt)],
);

export type Coach = typeof coaches.$inferSelect;
export type SkierRow = typeof skiers.$inferSelect;
export type NoteRow = typeof notes.$inferSelect;
export type SummaryRow = typeof summaries.$inferSelect;
export type SkierPhotoRow = typeof skierPhotos.$inferSelect;
