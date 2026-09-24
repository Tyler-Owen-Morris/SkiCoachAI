import { Mic, Square } from "lucide-react";
import { formatDuration, useVoiceRecording } from "@/voice/use-voice-recording";
import type { Equipment } from "@shared/sync";
import { saveRecordingAsNote, SKI_HINTS, type RosterSkier } from "@/voice/save-note";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface RecordFabProps {
  // Active skiers to match a quick note against by name.
  skiers: RosterSkier[];
  // On a skier's page every note is filed under them, on the equipment tab
  // being viewed.
  fixedSkier?: RosterSkier;
  equipment?: Equipment;
}

// The big raised mic in the bottom bar, plus the live-transcript panel shown
// above the bar while recording. Notes save on the phone, with or without signal.
export default function RecordFab({ skiers, fixedSkier, equipment }: RecordFabProps) {
  const { toast } = useToast();
  const rec = useVoiceRecording({
    hints: () => [...(fixedSkier ? [fixedSkier.name] : skiers.map((s) => s.name)), ...SKI_HINTS],
    onResult: async (result, startedAt) => {
      toast(await saveRecordingAsNote(result, startedAt, fixedSkier ? [fixedSkier] : skiers, fixedSkier, equipment));
    },
  });

  const idleHint = fixedSkier
    ? `Listening… this ${equipment === "snowboard" ? "snowboard" : "ski"} note is for ${fixedSkier.name}.`
    : "Listening… say the skier's name and it's filed for you.";

  return (
    <>
      {(rec.recording || rec.phase === "saving") && (
        <div className="fixed left-4 right-4 z-40 bottom-[calc(env(safe-area-inset-bottom)+6.5rem)] bg-white rounded-xl shadow-lg border border-neutral-200 p-4">
          <p className="text-sm font-medium text-red-600">
            {rec.recording ? `Recording ${formatDuration(rec.elapsed)} · tap the mic to stop` : "Saving…"}
          </p>
          <p className="text-neutral-800 text-sm mt-1 min-h-[1.25rem]">
            {rec.liveText ||
              (rec.liveAvailable ? idleHint : "Recording audio. Transcript will be created when there's signal.")}
          </p>
        </div>
      )}
      <button
        onClick={rec.toggle}
        disabled={rec.busy}
        aria-label={
          rec.recording
            ? "Stop recording"
            : fixedSkier
              ? `Record a note for ${fixedSkier.name}`
              : "Record a voice note"
        }
        className={cn(
          "-mt-9 mb-1 w-20 h-20 rounded-full border-4 border-white shadow-xl flex items-center justify-center transition-colors",
          rec.recording ? "bg-red-500 animate-pulse" : "bg-accent",
          rec.busy && "opacity-60",
        )}
      >
        {rec.recording ? <Square className="text-white" size={30} /> : <Mic className="text-white" size={36} />}
      </button>
    </>
  );
}
