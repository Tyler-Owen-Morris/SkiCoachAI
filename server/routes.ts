import { randomUUID } from "crypto";
import type { Express, NextFunction, Request, Response } from "express";
import multer from "multer";
import { z } from "zod";
import {
  ERROR_CODES,
  MAX_PUSH_OPS,
  parseSkierRequestSchema,
  pushOpSchema,
  type PullResponse,
  type PushResponse,
  type PushResult,
  type SummaryResponse,
  type TranscribeResponse,
} from "@shared/sync";
import { requireAuth, registerAuthRoutes, type AuthedRequest } from "./auth";
import {
  assignNoteToSkiers,
  HttpError,
  parseSkierDescription,
  summarizeSkier,
  toHttpError,
  transcribeAudio,
} from "./ai";
import { mergeNote, mergeSkier } from "./merge";
import { storage, toServerNote, toServerSkier, toServerSummary } from "./storage";
import { config } from "./config";

// 25 MB is OpenAI's transcription limit; a minute of voice at 64 kbps is ~0.5 MB.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// Pulls overlap by this much so a row committed just before the cursor was
// taken is never missed. Devices apply rows idempotently, so repeats are fine.
const PULL_OVERLAP_MS = 10_000;

const pushBatchSchema = z.object({ ops: z.array(z.unknown()).max(MAX_PUSH_OPS) });

type Handler = (req: AuthedRequest, res: Response) => Promise<unknown>;
const route =
  (handler: Handler) =>
  (req: Request, res: Response, next: NextFunction) =>
    handler(req as AuthedRequest, res).catch(next);

// Per-coach hourly cap on AI calls that use our key.
const aiUsage = new Map<string, number[]>();
function openAIKeyFor(req: AuthedRequest): string {
  if (req.userOpenAIKey) return req.userOpenAIKey;
  if (req.authMode !== "passcode" || !config.openaiApiKey) {
    throw new HttpError(424, "Add your OpenAI API key in Settings to use AI features", ERROR_CODES.openaiKeyRequired);
  }
  const now = Date.now();
  const recent = (aiUsage.get(req.coachId) ?? []).filter((t) => t > now - 3_600_000);
  if (recent.length >= config.aiCallsPerHour) {
    throw new HttpError(429, "Hourly AI limit reached for the demo key", ERROR_CODES.rateLimited);
  }
  recent.push(now);
  aiUsage.set(req.coachId, recent);
  return config.openaiApiKey;
}

export function registerRoutes(app: Express) {
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
  });

  registerAuthRoutes(app);

  // Applies a batch of changes queued on the device, in order. Each op is
  // idempotent (keyed by the device-generated id), so a retried batch is safe.
  app.post(
    "/api/sync/push",
    requireAuth,
    route(async (req, res) => {
      const batch = pushBatchSchema.safeParse(req.body);
      if (!batch.success) return res.status(400).json({ message: "Invalid sync batch" });
      const results: PushResult[] = [];
      for (const raw of batch.data.ops) {
        // Validate ops one by one so a single bad op can't block the rest.
        const parsedOp = pushOpSchema.safeParse(raw);
        if (!parsedOp.success) {
          const opId = typeof raw === "object" && raw && "opId" in raw ? String(raw.opId) : "unknown";
          const issue = parsedOp.error.issues[0];
          results.push({ opId, status: "rejected", error: `invalid ${issue?.path.join(".")}: ${issue?.message}` });
          continue;
        }
        const op = parsedOp.data;
        try {
          if (op.kind === "skier") {
            const existing = await storage.getSkier(op.data.id);
            if (existing && existing.coachId !== req.coachId) throw new Error("id belongs to another account");
            const write = mergeSkier(existing, op.data);
            if (write) await storage.writeSkier(req.coachId, write);
          } else {
            const existing = await storage.getNote(op.data.id);
            if (existing && existing.coachId !== req.coachId) throw new Error("id belongs to another account");
            if (op.data.skierId) {
              const skier = await storage.getSkier(op.data.skierId);
              if (skier && skier.coachId !== req.coachId) throw new Error("skier belongs to another account");
            }
            const write = mergeNote(existing, op.data);
            if (write) await storage.writeNote(req.coachId, write);
          }
          results.push({ opId: op.opId, status: "ok" });
        } catch (err) {
          const message = err instanceof Error ? err.message : "failed";
          // A database outage should fail the whole request so the device retries.
          if (!/another account/.test(message)) throw err;
          results.push({ opId: op.opId, status: "rejected", error: message });
        }
      }
      res.json({ results } satisfies PushResponse);
    }),
  );

  app.get(
    "/api/sync/pull",
    requireAuth,
    route(async (req, res) => {
      const sinceParam = typeof req.query.since === "string" ? req.query.since : "";
      const sinceMs = sinceParam ? Date.parse(sinceParam) : NaN;
      const since = Number.isFinite(sinceMs) ? new Date(sinceMs - PULL_OVERLAP_MS) : null;
      let cursor = new Date();
      const { skierRows, noteRows, summaryRows, limit } = await storage.changesSince(req.coachId, since);
      // A table that hit the row limit has more changes after its last row;
      // stop the cursor there so the next pull picks them up.
      for (const rows of [skierRows, noteRows, summaryRows]) {
        if (rows.length >= limit) {
          const last = rows[rows.length - 1].updatedAt;
          if (last < cursor) cursor = last;
        }
      }
      const body: PullResponse = {
        skiers: skierRows.map(toServerSkier),
        notes: noteRows.map(toServerNote),
        summaries: summaryRows.map(toServerSummary),
        cursor: cursor.toISOString(),
      };
      res.json(body);
    }),
  );

  // Uploads a recording, replaces the on-device transcript with a cloud one
  // (unless the coach edited it) and lets the AI route the note to skiers.
  app.post(
    "/api/notes/:id/transcribe",
    requireAuth,
    upload.single("audio"),
    route(async (req, res) => {
      const note = await storage.getNote(req.params.id);
      if (!note) {
        // The note's own sync hasn't landed yet; the device will retry.
        throw new HttpError(409, "Note not synced yet", ERROR_CODES.notFoundYet);
      }
      if (note.coachId !== req.coachId) throw new HttpError(403, "Access denied");
      // Deleted since it was queued: nothing to transcribe or route.
      if (note.deletedAt) return res.json({ note: toServerNote(note), createdNotes: [] } satisfies TranscribeResponse);

      // Resolved once so one request counts once against the demo-key limit.
      let aiKey: string | null = null;
      const keyFor = () => (aiKey ??= openAIKeyFor(req));
      const roster = await storage.activeRoster(req.coachId);
      let current = note;
      const createdNotes = [];

      console.log(
        `[transcribe] note=${note.id} file=${req.file ? `${req.file.originalname} ${req.file.mimetype} ${req.file.size}B` : "none"} ` +
          `status=${note.assignmentStatus} hasCloud=${!!note.cloudTranscript} userKey=${!!req.userOpenAIKey} mode=${req.authMode}`,
      );
      if (!current.cloudTranscript) {
        if (!req.file) throw new HttpError(400, "No audio file provided");
        const text = await transcribeAudio(
          keyFor(),
          req.file.buffer,
          req.file.mimetype,
          req.file.originalname,
          roster.map((s) => s.name),
        );
        current = await storage.patchNote(current.id, {
          cloudTranscript: text,
          hasAudio: true,
          ...(current.userEdited || !text ? {} : { content: text, transcriptSource: "cloud" }),
        });
      }

      const needsRouting = current.assignmentStatus === "local-guess" || current.assignmentStatus === "unassigned";
      if (needsRouting && !current.deletedAt && current.content.trim()) {
        const { assignments, confident } = await assignNoteToSkiers(keyFor(), current.content, roster);
        const status = confident ? "ai" : "ai-uncertain";
        if (assignments.length === 1) {
          current = await storage.patchNote(current.id, { skierId: assignments[0].skierId, assignmentStatus: status });
        } else if (assignments.length > 1) {
          const [first, ...rest] = assignments;
          current = await storage.patchNote(current.id, {
            skierId: first.skierId,
            assignmentStatus: status,
            ...(current.userEdited ? {} : { content: first.excerpt }),
          });
          for (const extra of rest) {
            const now = new Date();
            const row = await storage.writeNote(req.coachId, {
              id: randomUUID(),
              skierId: extra.skierId,
              content: extra.excerpt,
              deviceTranscript: null,
              cloudTranscript: null,
              transcriptSource: "cloud",
              assignmentStatus: status,
              userEdited: false,
              hasAudio: false,
              audioDurationMs: null,
              recordedAt: current.recordedAt,
              createdAt: now,
              // Device clock, like every other clientUpdatedAt: a server
              // timestamp would beat the coach's later edits on a phone whose
              // clock runs behind, and those edits would be silently dropped.
              clientUpdatedAt: current.clientUpdatedAt,
              deletedAt: null,
            });
            createdNotes.push(toServerNote(row));
          }
        }
        // No match: an unassigned note stays in the coach's inbox and a local
        // guess is kept as it was.
      }

      res.json({ note: toServerNote(current), createdNotes } satisfies TranscribeResponse);
    }),
  );

  // Idempotent: the summary id comes from the device, so a retry after a lost
  // response returns the summary that was already generated.
  app.post(
    "/api/skiers/:skierId/summaries/:id",
    requireAuth,
    route(async (req, res) => {
      const idCheck = z.string().min(8).max(64).safeParse(req.params.id);
      if (!idCheck.success) throw new HttpError(400, "Invalid summary id");
      const existing = await storage.getSummary(req.params.id);
      if (existing) {
        if (existing.coachId !== req.coachId) throw new HttpError(403, "Access denied");
        if (existing.status === "ready") {
          return res.json({ summary: toServerSummary(existing) } satisfies SummaryResponse);
        }
      }

      const skier = await storage.getSkier(req.params.skierId);
      if (!skier) throw new HttpError(409, "Skier not synced yet", ERROR_CODES.notFoundYet);
      if (skier.coachId !== req.coachId) throw new HttpError(403, "Access denied");

      const requestedAt =
        typeof req.body?.requestedAt === "string" && Number.isFinite(Date.parse(req.body.requestedAt))
          ? new Date(req.body.requestedAt)
          : new Date();
      const noteRows = await storage.activeNotesForSkier(req.coachId, skier.id);
      const base = {
        id: req.params.id,
        coachId: req.coachId,
        skierId: skier.id,
        requestedAt,
        noteCount: noteRows.length,
      };

      if (noteRows.length === 0) {
        const saved = await storage.writeSummary({
          ...base,
          status: "error",
          content: null,
          error: "No notes to summarize yet",
        });
        return res.json({ summary: toServerSummary(saved) } satisfies SummaryResponse);
      }

      const key = openAIKeyFor(req);
      const content = await summarizeSkier(key, skier, noteRows);
      const saved = await storage.writeSummary({
        ...base,
        status: "ready",
        content: JSON.stringify(content),
        error: null,
      });
      res.json({ summary: toServerSummary(saved) } satisfies SummaryResponse);
    }),
  );

  // Turns a spoken description ("Lisa is 25, intermediate, red jacket") into
  // skier fields. Interactive, not queued: the phone falls back to an
  // on-device parser when this can't be reached.
  app.post(
    "/api/ai/parse-skier",
    requireAuth,
    route(async (req, res) => {
      const parsed = parseSkierRequestSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, "A transcript is required");
      const key = openAIKeyFor(req);
      const result = await parseSkierDescription(key, parsed.data.transcript);
      console.log(
        `[parse-skier] chars=${parsed.data.transcript.length} name=${!!result.name} age=${result.age !== null} level=${result.level ?? "-"} notes=${!!result.notes}`,
      );
      res.json(result);
    }),
  );

  app.use("/api", (err: unknown, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(err);
    if (err instanceof multer.MulterError) {
      console.warn(`[api-error] ${req.method} ${req.path} 413 upload: ${err.message}`);
      return res.status(413).json({ message: err.message });
    }
    const httpErr = err instanceof HttpError ? err : isOpenAIish(err) ? toHttpError(err) : null;
    if (httpErr) {
      // Why a request was refused. Never includes keys or note text.
      console.warn(`[api-error] ${req.method} ${req.path} ${httpErr.status} ${httpErr.code ?? "-"}: ${httpErr.message}`);
      return res.status(httpErr.status).json({ message: httpErr.message, code: httpErr.code });
    }
    console.error("Unhandled API error:", err);
    res.status(500).json({ message: "Server error" });
  });
}

function isOpenAIish(err: unknown) {
  return !!err && typeof err === "object" && "status" in err && "headers" in err;
}
