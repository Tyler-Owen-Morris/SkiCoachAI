import OpenAI, { toFile } from "openai";
import { ERROR_CODES, type SummaryContent } from "@shared/sync";
import { config } from "./config";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

const clients = new Map<string, OpenAI>();
function clientFor(apiKey: string) {
  let client = clients.get(apiKey);
  if (!client) {
    // Retries are handled by the phone's sync queue, so fail fast here.
    client = new OpenAI({ apiKey, maxRetries: 1, timeout: 90_000 });
    if (clients.size > 200) clients.clear();
    clients.set(apiKey, client);
  }
  return client;
}

export function serverKeyAvailable() {
  return !!config.openaiApiKey;
}

// Maps OpenAI failures to responses the phone knows how to handle:
// 424 = key problem (keep the work, retry slowly, tell the coach),
// 502/503 = temporary (retry with backoff).
export function toHttpError(err: unknown): HttpError {
  if (err instanceof HttpError) return err;
  if (err instanceof OpenAI.APIError) {
    const code = (err as { code?: string | null }).code;
    if (err.status === 401 || err.status === 403) {
      return new HttpError(424, "OpenAI rejected the API key", ERROR_CODES.openaiKeyInvalid);
    }
    if (err.status === 429 && code === "insufficient_quota") {
      return new HttpError(424, "The OpenAI account is out of credit", ERROR_CODES.openaiKeyInvalid);
    }
    if (err.status === 400) {
      return new HttpError(400, `OpenAI could not process the request: ${err.message}`);
    }
    return new HttpError(503, "OpenAI is temporarily unavailable", ERROR_CODES.openaiUnavailable);
  }
  return new HttpError(502, "AI request failed", ERROR_CODES.openaiUnavailable);
}

export async function validateOpenAIKey(
  apiKey: string,
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  try {
    await clientFor(apiKey).models.list();
    return { ok: true };
  } catch (err) {
    if (err instanceof OpenAI.APIError && (err.status === 401 || err.status === 403)) {
      return { ok: false, status: 403, message: "OpenAI rejected that API key" };
    }
    return { ok: false, status: 503, message: "Could not reach OpenAI to check the key. Try again." };
  }
}

export const SKI_VOCABULARY = [
  "angulation",
  "inclination",
  "carving",
  "skidding",
  "pole plant",
  "fore-aft",
  "edging",
  "edge angle",
  "counter-rotation",
  "upper-lower body separation",
  "stivot",
  "pivot slip",
  "short turns",
  "long radius turns",
  "moguls",
  "bumps",
  "crud",
  "groomer",
  "stance",
  "snowplow",
  "wedge",
  "stem christie",
  "parallel turns",
  "hockey stop",
  "shin pressure",
  "boot cuff",
  "tip lead",
  "outside ski",
  "inside ski",
  "transition",
  "float",
];

const EXTENSIONS: Record<string, string> = {
  "audio/mp4": "m4a",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "m4a",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};

export function audioExtension(mimeType: string, originalName?: string) {
  const base = mimeType.split(";")[0].trim().toLowerCase();
  if (EXTENSIONS[base]) return EXTENSIONS[base];
  const ext = originalName?.split(".").pop()?.toLowerCase();
  return ext && ext.length <= 4 ? ext : "m4a";
}

export async function transcribeAudio(
  apiKey: string,
  audio: Buffer,
  mimeType: string,
  originalName: string | undefined,
  skierNames: string[],
): Promise<string> {
  const ext = audioExtension(mimeType, originalName);
  const file = await toFile(audio, `note.${ext}`, { type: mimeType.split(";")[0] });
  const supportsKeywords = config.transcribeModel === "gpt-transcribe";
  const keywords = [...skierNames, ...SKI_VOCABULARY].slice(0, 100);
  const prompt = supportsKeywords
    ? "A ski instructor dictating a short coaching note about one or more named students."
    : `A ski instructor dictating a coaching note. Students: ${skierNames.join(", ")}. Terms: ${SKI_VOCABULARY.join(", ")}.`;
  try {
    const result = await clientFor(apiKey).audio.transcriptions.create({
      file,
      model: config.transcribeModel,
      prompt,
      ...(supportsKeywords ? { keywords } : {}),
    });
    return result.text.trim();
  } catch (err) {
    throw toHttpError(err);
  }
}

function reasoningParam() {
  return config.reasoningEffort === "none"
    ? {}
    : { reasoning: { effort: config.reasoningEffort as "low" | "medium" | "high" } };
}

async function structuredCall<T>(
  apiKey: string,
  name: string,
  instructions: string,
  input: string,
  schema: Record<string, unknown>,
): Promise<T> {
  try {
    const response = await clientFor(apiKey).responses.create({
      model: config.textModel,
      ...reasoningParam(),
      instructions,
      input,
      text: { format: { type: "json_schema", name, schema, strict: true } },
    });
    return JSON.parse(response.output_text) as T;
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new HttpError(502, "AI returned malformed output", ERROR_CODES.openaiUnavailable);
    }
    throw toHttpError(err);
  }
}

export interface AssignmentResult {
  assignments: { skierId: string; excerpt: string }[];
  confident: boolean;
}

export async function assignNoteToSkiers(
  apiKey: string,
  transcript: string,
  roster: { id: string; name: string }[],
): Promise<AssignmentResult> {
  if (roster.length === 0 || !transcript.trim()) return { assignments: [], confident: false };
  const result = await structuredCall<AssignmentResult>(
    apiKey,
    "note_assignment",
    [
      "You route a ski coach's dictated voice note to the student(s) it is about.",
      "Only use skier ids from the roster. Match nicknames, first names and misspellings from speech recognition.",
      "If the note covers several students, return one assignment per student with the part of the note about them as the excerpt, lightly cleaned up but not reworded.",
      "If the note is about one student, the excerpt is the whole note, lightly cleaned up.",
      "If no roster student is clearly mentioned, return no assignments. Set confident=false when unsure.",
    ].join(" "),
    `Roster:\n${roster.map((s) => `${s.id}: ${s.name}`).join("\n")}\n\nNote:\n${transcript}`,
    {
      type: "object",
      additionalProperties: false,
      required: ["assignments", "confident"],
      properties: {
        assignments: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["skierId", "excerpt"],
            properties: { skierId: { type: "string" }, excerpt: { type: "string" } },
          },
        },
        confident: { type: "boolean" },
      },
    },
  );
  const validIds = new Set(roster.map((s) => s.id));
  return {
    confident: result.confident,
    assignments: result.assignments.filter((a) => validIds.has(a.skierId) && a.excerpt.trim()),
  };
}

export async function summarizeSkier(
  apiKey: string,
  skier: { name: string; level: string; age: number | null; initialNotes: string | null },
  notes: { recordedAt: Date; content: string }[],
): Promise<SummaryContent> {
  const notesText = notes
    .map((n) => `[${n.recordedAt.toISOString().slice(0, 10)}] ${n.content}`)
    .join("\n");
  return structuredCall<SummaryContent>(
    apiKey,
    "skier_summary",
    "You are an expert ski instructor's assistant. Summarize coaching notes into constructive, specific, actionable feedback a coach can use in the next lesson. Be concise. Base everything on the notes; do not invent observations.",
    [
      `Skier: ${skier.name}, level ${skier.level}${skier.age ? `, age ${skier.age}` : ""}.`,
      skier.initialNotes ? `Coach's initial notes: ${skier.initialNotes}` : "",
      `Coaching notes (oldest first):\n${notesText}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
    {
      type: "object",
      additionalProperties: false,
      required: ["overview", "strengths", "areasToImprove", "drills", "nextFocus"],
      properties: {
        overview: { type: "string", description: "2-3 sentence overview of progress" },
        strengths: { type: "array", items: { type: "string" } },
        areasToImprove: { type: "array", items: { type: "string" } },
        drills: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["name", "why"],
            properties: { name: { type: "string" }, why: { type: "string" } },
          },
        },
        nextFocus: { type: "string", description: "The single most important focus for the next session" },
      },
    },
  );
}
