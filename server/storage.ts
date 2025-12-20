import {
  users,
  skiers,
  notes,
  summaries,
  type User,
  type UpsertUser,
  type Skier,
  type InsertSkier,
  type Note,
  type InsertNote,
  type Summary,
  type InsertSummary,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and } from "drizzle-orm";

export interface IStorage {
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Skier operations
  getSkiersByCoach(coachId: string, archived?: boolean): Promise<Skier[]>;
  getSkier(id: string): Promise<Skier | undefined>;
  createSkier(skier: InsertSkier, coachId: string): Promise<Skier>;
  archiveSkier(id: string): Promise<Skier | undefined>;
  unarchiveSkier(id: string): Promise<Skier | undefined>;
  deleteSkier(id: string): Promise<void>;
  
  // Note operations
  getNotesBySkier(skierId: string): Promise<Note[]>;
  createNote(note: InsertNote, coachId: string): Promise<Note>;
  deleteNotesBySkier(skierId: string): Promise<void>;
  
  // Summary operations
  getLatestSummaryBySkier(skierId: string): Promise<Summary | undefined>;
  createSummary(summary: InsertSummary, coachId: string): Promise<Summary>;
  deleteSummariesBySkier(skierId: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  // Skier operations
  async getSkiersByCoach(coachId: string, archived: boolean = false): Promise<Skier[]> {
    return await db
      .select()
      .from(skiers)
      .where(and(eq(skiers.coachId, coachId), eq(skiers.archived, archived)))
      .orderBy(desc(skiers.updatedAt));
  }

  async getSkier(id: string): Promise<Skier | undefined> {
    const [skier] = await db.select().from(skiers).where(eq(skiers.id, id));
    return skier;
  }

  async createSkier(skier: InsertSkier, coachId: string): Promise<Skier> {
    const [newSkier] = await db
      .insert(skiers)
      .values({ ...skier, coachId })
      .returning();
    return newSkier;
  }

  async archiveSkier(id: string): Promise<Skier | undefined> {
    const [skier] = await db
      .update(skiers)
      .set({ archived: true, updatedAt: new Date() })
      .where(eq(skiers.id, id))
      .returning();
    return skier;
  }

  async unarchiveSkier(id: string): Promise<Skier | undefined> {
    const [skier] = await db
      .update(skiers)
      .set({ archived: false, updatedAt: new Date() })
      .where(eq(skiers.id, id))
      .returning();
    return skier;
  }

  async deleteSkier(id: string): Promise<void> {
    await db.delete(skiers).where(eq(skiers.id, id));
  }

  // Note operations
  async getNotesBySkier(skierId: string): Promise<Note[]> {
    return await db
      .select()
      .from(notes)
      .where(eq(notes.skierId, skierId))
      .orderBy(desc(notes.createdAt));
  }

  async createNote(note: InsertNote, coachId: string): Promise<Note> {
    const [newNote] = await db
      .insert(notes)
      .values({ ...note, coachId })
      .returning();
    return newNote;
  }

  async deleteNotesBySkier(skierId: string): Promise<void> {
    await db.delete(notes).where(eq(notes.skierId, skierId));
  }

  // Summary operations
  async getLatestSummaryBySkier(skierId: string): Promise<Summary | undefined> {
    const [summary] = await db
      .select()
      .from(summaries)
      .where(eq(summaries.skierId, skierId))
      .orderBy(desc(summaries.createdAt))
      .limit(1);
    return summary;
  }

  async createSummary(summary: InsertSummary, coachId: string): Promise<Summary> {
    const [newSummary] = await db
      .insert(summaries)
      .values({ ...summary, coachId })
      .returning();
    return newSummary;
  }

  async deleteSummariesBySkier(skierId: string): Promise<void> {
    await db.delete(summaries).where(eq(summaries.skierId, skierId));
  }
}

export const storage = new DatabaseStorage();
