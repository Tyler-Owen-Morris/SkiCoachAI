import { SKIER_LEVELS, type ParsedSkier } from "@shared/sync";

// On-device fallback for "add a skier by voice" when the AI can't be reached
// (no signal, not signed in). Handles the common phrasing, e.g.
//   "Lisa is 25 years old. She's an intermediate skier, and you can spot her
//    by her bright red jacket."
// The AI version (server/ai.ts parseSkierDescription) is smarter; this just
// has to be good enough to save something the coach can fix later.

const NOT_NAMES = new Set([
  "she", "he", "they", "the", "this", "that", "it", "i", "we", "you", "her", "his", "their",
  "new", "and", "but", "so", "also", "okay", "ok", "um", "uh", "hey", "add", "skier", "student",
]);

const LEVEL_WORDS: [RegExp, ParsedSkier["level"]][] = [
  [/\b(expert|pro|racer)\b/i, "expert"],
  [/\badvanced\b/i, "advanced"],
  [/\bintermediate\b/i, "intermediate"],
  [/\b(beginner|novice|never[- ]ever|first[- ]tim(?:e|er)|first time on skis)\b/i, "beginner"],
];

const SNOWBOARD = /\b(snow ?board(?:er|ing)?|boarder|on a board|rides? a board)\b/i;
const SKI_WORD = /\b(skis|skier|skiing|on skis)\b/i;

// "25 years old", "aged 9", or a bare "is 14," / "she's 7."
const AGE =
  /\b(\d{1,3})\s*(?:-|\s)?\s*(?:years?|yrs?|yo)\b(?:\s*-?\s*old)?|\bage(?:d)?\s*(?:is\s*)?(\d{1,3})\b|\b(?:is|who's|who is|she's|he's)\s+(\d{1,2})(?=\s*(?:[,.;!]|and\b|$))/i;
const NAME_INTRO = /\b(?:name is|named|called|this is|meet|new skier(?: is)?)[:,]?\s+([A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’-]+)?)/u;
// Clauses that only announce what's happening ("new skier", "okay so").
const FILLER = /^(?:okay|ok|so|um|uh|alright|(?:add(?:ing)?\s+)?(?:a\s+)?new\s+(?:skier|student|kid)|this is (?:a )?new (?:skier|student))$/i;
const NAME_SUBJECT = /^([A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’-]+)?)(?:\s+(?:is|was|has)\b|['’]s\b)/u;

function titleCase(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function findName(text: string, sentences: string[]): string | null {
  const intro = text.match(NAME_INTRO);
  if (intro && !NOT_NAMES.has(intro[1].split(/\s+/)[0].toLowerCase())) return titleCase(intro[1]);
  for (const sentence of sentences) {
    const m = sentence.match(NAME_SUBJECT);
    if (m) {
      // "Lisa Smith is" -> both words; but not "Lisa Is" style artifacts.
      const words = m[1].split(/\s+/).filter((w) => !NOT_NAMES.has(w.toLowerCase()));
      if (words.length > 0) return titleCase(words.join(" "));
    }
  }
  return null;
}

export function parseSkierLocally(transcript: string): ParsedSkier {
  const text = transcript.replace(/\s+/g, " ").trim();
  const sentences = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);

  const ageMatch = text.match(AGE);
  const ageNum = ageMatch ? parseInt(ageMatch[1] ?? ageMatch[2] ?? ageMatch[3], 10) : NaN;
  const age = ageNum >= 1 && ageNum <= 120 ? ageNum : null;

  let level: ParsedSkier["level"] = null;
  for (const [pattern, value] of LEVEL_WORDS) {
    if (pattern.test(text)) {
      level = value;
      break;
    }
  }

  const name = findName(text, sentences);
  const equipment: ParsedSkier["equipment"] = SNOWBOARD.test(text) ? "snowboard" : SKI_WORD.test(text) ? "ski" : null;

  // Notes: every clause that isn't just the name, age or level.
  const clauses = sentences
    .flatMap((s) => s.replace(/[.!?]+$/, "").split(/,\s*(?:and\s+)?|;\s*|\s+and\s+(?=you\b|she\b|he\b|they\b)/i))
    .map((c) => c.trim())
    .filter(Boolean);
  const kept = clauses.filter(
    (c) =>
      !AGE.test(c) &&
      !LEVEL_WORDS.some(([p]) => p.test(c)) &&
      !NAME_INTRO.test(c) &&
      !FILLER.test(c) &&
      !SNOWBOARD.test(c) &&
      c.length > 3,
  );
  const notes = kept.length
    ? kept.map((c) => c.charAt(0).toUpperCase() + c.slice(1)).join(". ") + "."
    : null;

  return { name, age, level: level && SKIER_LEVELS.includes(level) ? level : null, equipment, notes };
}
