import { z } from "zod";

// Wire protocol shared by the phone and the server. Timestamps are ISO strings.

export const SKIER_LEVELS = ["beginner", "intermediate", "advanced", "expert"] as const;
export const TRANSCRIPT_SOURCES = ["device", "cloud", "typed"] as const;
export const ASSIGNMENT_STATUSES = ["manual", "local-guess", "ai", "ai-uncertain", "unassigned"] as const;

export type TranscriptSource = (typeof TRANSCRIPT_SOURCES)[number];
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

const isoDate = z.string().datetime({ offset: true });
const id = z.string().min(8).max(64);

export const skierPayloadSchema = z.object({
  id,
  name: z.string().trim().min(1).max(200),
  level: z.enum(SKIER_LEVELS),
  age: z.number().int().min(1).max(120).nullable(),
  initialNotes: z.string().max(10_000).nullable(),
  createdAt: isoDate,
  updatedAt: isoDate,
  deletedAt: isoDate.nullable(),
});
export type SkierPayload = z.infer<typeof skierPayloadSchema>;

export const notePayloadSchema = z.object({
  id,
  skierId: id.nullable(),
  content: z.string().max(50_000),
  deviceTranscript: z.string().max(50_000).nullable(),
  transcriptSource: z.enum(TRANSCRIPT_SOURCES),
  assignmentStatus: z.enum(ASSIGNMENT_STATUSES),
  userEdited: z.boolean(),
  hasAudio: z.boolean(),
  audioDurationMs: z.number().int().min(0).nullable(),
  recordedAt: isoDate,
  createdAt: isoDate,
  updatedAt: isoDate,
  deletedAt: isoDate.nullable(),
});
export type NotePayload = z.infer<typeof notePayloadSchema>;

export const pushOpSchema = z.discriminatedUnion("kind", [
  z.object({ opId: z.string().min(1).max(64), kind: z.literal("skier"), data: skierPayloadSchema }),
  z.object({ opId: z.string().min(1).max(64), kind: z.literal("note"), data: notePayloadSchema }),
]);
export type PushOp = z.infer<typeof pushOpSchema>;

export const MAX_PUSH_OPS = 100;
export const pushRequestSchema = z.object({ ops: z.array(pushOpSchema).max(MAX_PUSH_OPS) });
export type PushRequest = z.infer<typeof pushRequestSchema>;

export interface PushResult {
  opId: string;
  status: "ok" | "rejected";
  error?: string;
}
export interface PushResponse {
  results: PushResult[];
}

// Rows as the server sends them back (pull, transcribe, summary responses).
export interface ServerSkier extends SkierPayload {
  serverUpdatedAt: string;
}
export interface ServerNote extends NotePayload {
  cloudTranscript: string | null;
  serverUpdatedAt: string;
}
export interface SummaryContent {
  overview: string;
  strengths: string[];
  areasToImprove: string[];
  drills: { name: string; why: string }[];
  nextFocus: string;
}
export interface ServerSummary {
  id: string;
  skierId: string;
  status: "pending" | "ready" | "error";
  content: SummaryContent | null;
  error: string | null;
  noteCount: number | null;
  requestedAt: string;
  serverUpdatedAt: string;
}

export interface PullResponse {
  skiers: ServerSkier[];
  notes: ServerNote[];
  summaries: ServerSummary[];
  cursor: string;
}

export interface TranscribeResponse {
  note: ServerNote;
  // Extra notes the AI split out when one recording covered several skiers.
  createdNotes: ServerNote[];
}

export interface SummaryResponse {
  summary: ServerSummary;
}

export type AuthMode = "passcode" | "byok";
export interface AuthResponse {
  token: string;
  coachId: string;
  mode: AuthMode;
  expiresAt: string;
}
export interface MeResponse {
  coachId: string;
  mode: AuthMode;
  serverKeyAvailable: boolean;
}

// Error codes the client uses to decide whether to retry.
export const ERROR_CODES = {
  openaiKeyRequired: "openai_key_required",
  openaiKeyInvalid: "openai_key_invalid",
  openaiUnavailable: "openai_unavailable",
  notFoundYet: "not_found_yet",
  rateLimited: "rate_limited",
} as const;

export const OPENAI_KEY_HEADER = "x-openai-key";
