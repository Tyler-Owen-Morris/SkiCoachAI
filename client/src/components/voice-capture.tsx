import { Mic, Square } from "lucide-react";
import { formatDuration, useVoiceRecording } from "@/voice/use-voice-recording";
import { saveRecordingAsNote, SKI_HINTS } from "@/voice/save-note";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface VoiceCaptureProps {
  // Recording from a skier's page files the note under them directly.
  skier: { id: string; name: string };
}

// Record button on a skier's page. The note is saved on the phone the moment
// recording stops, with or without signal.
export default function VoiceCapture({ skier }: VoiceCaptureProps) {
  const { toast } = useToast();
  const rec = useVoiceRecording({
    hints: () => [skier.name, ...SKI_HINTS],
    onResult: async (result, startedAt) => {
      toast(await saveRecordingAsNote(result, startedAt, [skier], skier));
    },
  });

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm">
      <div className="flex items-center gap-4">
        <button
          onClick={rec.toggle}
          disabled={rec.busy}
          aria-label={rec.recording ? "Stop recording" : "Start recording"}
          className={cn(
            "w-20 h-20 shrink-0 rounded-full shadow-lg flex items-center justify-center transition-colors",
            rec.recording ? "bg-red-500 animate-pulse" : "bg-accent",
            rec.busy && "opacity-60",
          )}
        >
          {rec.recording ? <Square className="text-white" size={30} /> : <Mic className="text-white" size={34} />}
        </button>
        <div className="min-w-0">
          <h3 className="text-lg font-medium text-neutral-800">Note for {skier.name}</h3>
          <p className="text-sm text-neutral-600">
            {rec.phase === "starting" && "Starting…"}
            {rec.phase === "saving" && "Saving…"}
            {rec.recording && `Recording ${formatDuration(rec.elapsed)} · tap to stop`}
            {rec.phase === "idle" && "Tap to record. Works offline."}
          </p>
        </div>
      </div>

      {rec.recording && (
        <div className="mt-4 bg-neutral-50 rounded-lg p-3 min-h-[3rem]">
          <p className="text-neutral-800 text-sm">
            {rec.liveText ||
              (rec.liveAvailable ? "Listening…" : "Recording audio. Transcript will be created when there's signal.")}
          </p>
        </div>
      )}
    </div>
  );
}
