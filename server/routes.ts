import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { insertSkierSchema, insertNoteSchema } from "@shared/schema";
import { transcribeAudio, generateSummary } from "./services/openai";
import multer from "multer";

const upload = multer({ storage: multer.memoryStorage() });

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Skier routes
  app.get('/api/skiers', isAuthenticated, async (req: any, res) => {
    try {
      const coachId = req.user.claims.sub;
      const skiers = await storage.getSkiersByCoach(coachId);
      
      // Get note counts for each skier
      const skiersWithCounts = await Promise.all(
        skiers.map(async (skier) => {
          const notes = await storage.getNotesBySkier(skier.id);
          return {
            ...skier,
            noteCount: notes.length,
            lastNote: notes.length > 0 ? notes[0].createdAt : null,
          };
        })
      );
      
      res.json(skiersWithCounts);
    } catch (error) {
      console.error("Error fetching skiers:", error);
      res.status(500).json({ message: "Failed to fetch skiers" });
    }
  });

  app.get('/api/skiers/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const skier = await storage.getSkier(id);
      
      if (!skier) {
        return res.status(404).json({ message: "Skier not found" });
      }
      
      // Verify coach ownership
      if (skier.coachId !== req.user.claims.sub) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      res.json(skier);
    } catch (error) {
      console.error("Error fetching skier:", error);
      res.status(500).json({ message: "Failed to fetch skier" });
    }
  });

  app.post('/api/skiers', isAuthenticated, async (req: any, res) => {
    try {
      const coachId = req.user.claims.sub;
      const skierData = insertSkierSchema.parse(req.body);
      
      const skier = await storage.createSkier(skierData, coachId);
      res.status(201).json(skier);
    } catch (error) {
      console.error("Error creating skier:", error);
      res.status(500).json({ message: "Failed to create skier" });
    }
  });

  // Note routes
  app.get('/api/skiers/:skierId/notes', isAuthenticated, async (req: any, res) => {
    try {
      const { skierId } = req.params;
      
      // Verify skier belongs to coach
      const skier = await storage.getSkier(skierId);
      if (!skier || skier.coachId !== req.user.claims.sub) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const notes = await storage.getNotesBySkier(skierId);
      res.json(notes);
    } catch (error) {
      console.error("Error fetching notes:", error);
      res.status(500).json({ message: "Failed to fetch notes" });
    }
  });

  app.post('/api/skiers/:skierId/notes', isAuthenticated, async (req: any, res) => {
    try {
      const { skierId } = req.params;
      const coachId = req.user.claims.sub;
      
      // Verify skier belongs to coach
      const skier = await storage.getSkier(skierId);
      if (!skier || skier.coachId !== coachId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const noteData = insertNoteSchema.parse({ ...req.body, skierId });
      const note = await storage.createNote(noteData, coachId);
      
      res.status(201).json(note);
    } catch (error) {
      console.error("Error creating note:", error);
      res.status(500).json({ message: "Failed to create note" });
    }
  });

  // Transcription route
  app.post('/api/transcribe', isAuthenticated, upload.single('audio'), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No audio file provided" });
      }
      
      const { text } = await transcribeAudio(req.file.buffer);
      res.json({ text });
    } catch (error) {
      console.error("Error transcribing audio:", error);
      res.status(500).json({ message: "Failed to transcribe audio" });
    }
  });

  // Summary routes
  app.get('/api/skiers/:skierId/summary', isAuthenticated, async (req: any, res) => {
    try {
      const { skierId } = req.params;
      
      // Verify skier belongs to coach
      const skier = await storage.getSkier(skierId);
      if (!skier || skier.coachId !== req.user.claims.sub) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const summary = await storage.getLatestSummaryBySkier(skierId);
      res.json(summary);
    } catch (error) {
      console.error("Error fetching summary:", error);
      res.status(500).json({ message: "Failed to fetch summary" });
    }
  });

  app.post('/api/skiers/:skierId/summary', isAuthenticated, async (req: any, res) => {
    try {
      const { skierId } = req.params;
      const coachId = req.user.claims.sub;
      
      // Verify skier belongs to coach
      const skier = await storage.getSkier(skierId);
      if (!skier || skier.coachId !== coachId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Get all notes for the skier
      const notes = await storage.getNotesBySkier(skierId);
      if (notes.length === 0) {
        return res.status(400).json({ message: "No notes available to summarize" });
      }
      
      // Generate summary using OpenAI
      const noteTexts = notes.map(note => note.content);
      const { summary: summaryText } = await generateSummary(noteTexts);
      
      // Save summary to database
      const summary = await storage.createSummary(
        { content: summaryText, skierId },
        coachId
      );
      
      res.status(201).json(summary);
    } catch (error) {
      console.error("Error generating summary:", error);
      res.status(500).json({ message: "Failed to generate summary" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
