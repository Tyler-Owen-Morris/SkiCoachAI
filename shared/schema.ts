import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  varchar,
  integer,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Session storage table (required for Replit Auth)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table (required for Replit Auth)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Skiers table
export const skiers = pgTable("skiers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  level: varchar("level").notNull(), // beginner, intermediate, advanced, expert
  age: integer("age"),
  initialNotes: text("initial_notes"),
  coachId: varchar("coach_id").notNull().references(() => users.id),
  archived: boolean("archived").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Notes table
export const notes = pgTable("notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  content: text("content").notNull(),
  skierId: varchar("skier_id").notNull().references(() => skiers.id),
  coachId: varchar("coach_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Summaries table
export const summaries = pgTable("summaries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  content: text("content").notNull(),
  skierId: varchar("skier_id").notNull().references(() => skiers.id),
  coachId: varchar("coach_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  skiers: many(skiers),
  notes: many(notes),
  summaries: many(summaries),
}));

export const skiersRelations = relations(skiers, ({ one, many }) => ({
  coach: one(users, {
    fields: [skiers.coachId],
    references: [users.id],
  }),
  notes: many(notes),
  summaries: many(summaries),
}));

export const notesRelations = relations(notes, ({ one }) => ({
  skier: one(skiers, {
    fields: [notes.skierId],
    references: [skiers.id],
  }),
  coach: one(users, {
    fields: [notes.coachId],
    references: [users.id],
  }),
}));

export const summariesRelations = relations(summaries, ({ one }) => ({
  skier: one(skiers, {
    fields: [summaries.skierId],
    references: [skiers.id],
  }),
  coach: one(users, {
    fields: [summaries.coachId],
    references: [users.id],
  }),
}));

// Insert schemas
export const insertSkierSchema = createInsertSchema(skiers).omit({
  id: true,
  coachId: true,
  createdAt: true,
  updatedAt: true,
});

export const insertNoteSchema = createInsertSchema(notes).omit({
  id: true,
  coachId: true,
  createdAt: true,
});

export const insertSummarySchema = createInsertSchema(summaries).omit({
  id: true,
  coachId: true,
  createdAt: true,
});

// Types
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type Skier = typeof skiers.$inferSelect;
export type InsertSkier = z.infer<typeof insertSkierSchema>;
export type Note = typeof notes.$inferSelect;
export type InsertNote = z.infer<typeof insertNoteSchema>;
export type Summary = typeof summaries.$inferSelect;
export type InsertSummary = z.infer<typeof insertSummarySchema>;
