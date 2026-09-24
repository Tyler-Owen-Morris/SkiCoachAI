import { getServices, afterLocalWrite } from "@/app/services";
import { saveVoiceNote } from "@/data/repo";
import { guessSkier, type NamedSkier } from "@/lib/name-match";
import type { RecordingResult } from "./recorder";

export const SKI_HINTS = [
  "angulation",
  "inclination",
  "carving",
  "pole plant",
  "fore-aft",
  "edging",
  "counter-rotation",
  "moguls",
  "wedge",
  "parallel",
  "stance",
];

// Saves a finished recording as a note on the phone (with or without signal)
// and returns a toast describing where it went.
export async function saveRecordingAsNote(
  result: RecordingResult,
  startedAt: number,
  skiers: NamedSkier[],
  fixedSkier?: NamedSkier,
): Promise<{ title: string; description: string }> {
  const transcript = result.transcript.trim();
  const guess = fixedSkier ? null : guessSkier(transcript, skiers);
  const skierId = fixedSkier?.id ?? guess?.id ?? null;
  await saveVoiceNote(getServices().db, {
    skierId,
    assignmentStatus: fixedSkier ? "manual" : guess ? "local-guess" : "unassigned",
    transcript,
    audioFile: result.fileName,
    audioMime: result.mimeType,
    durationMs: result.durationMs,
    recordedAt: new Date(startedAt).toISOString(),
  });
  afterLocalWrite();
  const who = fixedSkier?.name ?? guess?.name;
  return who
    ? { title: `Saved for ${who}`, description: "The transcript will be polished when there's signal." }
    : {
        title: "Saved to inbox",
        description: "No skier recognized yet. AI will try when there's signal, or assign it yourself.",
      };
}
