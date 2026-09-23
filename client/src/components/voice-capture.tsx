import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { getServices, afterLocalWrite } from "@/app/services";
import { saveVoiceNote, type SkierWithStats } from "@/data/repo";
import { guessSkier } from "@/lib/name-match";
import { recorder } from "@/voice/recorder";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface VoiceCaptureProps {
  skiers: SkierWithStats[];
  // Recording from a skier's page files the note under them directly.
  fixedSkier?: { id: string; name: string };
}

type Phase = "idle" | "starting" | "recording" | "saving";

const SKI_HINTS = [
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

function formatDuration(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// Big tap-to-record button. The note is saved on the phone the moment
// recording stops, with or without signal.
export default function VoiceCapture({ skiers, fixedSkier }: VoiceCaptureProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [liveText, setLiveText] = useState("");
  const [liveAvailable, setLiveAvailable] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);
  const phaseRef = useRef<Phase>("idle");
  const mounted = useRef(true);
  const { toast } = useToast();

  phaseRef.current = phase;
  // Callbacks registered once (unmount cleanup, recorder interruption) must
  // save with the current skier list, not the one from when they were made.
  const finishRef = useRef<() => Promise<void>>(async () => undefined);

  useEffect(() => {
    if (phase !== "recording") return;
    const id = setInterval(() => setElapsed(Date.now() - startedAt.current), 250);
    return () => clearInterval(id);
  }, [phase]);

  // Never leave the mic running if the coach navigates away mid-note.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (phaseRef.current === "recording") void finishRef.current();
    };
  }, []);

  async function begin() {
    // Guard against a double tap landing before the re-render disables the button.
    if (phaseRef.current !== "idle") return;
    phaseRef.current = "starting";
    setPhase("starting");
    try {
      const allowed = await recorder.ensurePermission();
      if (!allowed) {
        phaseRef.current = "idle";
        toast({
          title: "Microphone is off",
          description: "Allow microphone access for Ski Coach AI in the iPhone Settings app.",
          variant: "destructive",
        });
        setPhase("idle");
        return;
      }
      setLiveText("");
      const names = fixedSkier ? [fixedSkier.name] : skiers.map((s) => s.name);
      const info = await recorder.start([...names, ...SKI_HINTS], {
        onPartial: (text) => setLiveText(text),
        onInterrupted: () => {
          if (phaseRef.current === "recording") void finishRef.current();
        },
      });
      phaseRef.current = "recording";
      if (!mounted.current) {
        // The coach left while the mic was starting: keep what was captured
        // rather than leaving the mic running with nobody to stop it.
        void finishRef.current();
        return;
      }
      setLiveAvailable(info.transcribing);
      startedAt.current = Date.now();
      setElapsed(0);
      setPhase("recording");
    } catch (err) {
      phaseRef.current = "idle";
      toast({
        title: "Couldn't start recording",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
      setPhase("idle");
    }
  }

  async function finish() {
    if (phaseRef.current !== "recording") return;
    setPhase("saving");
    phaseRef.current = "saving";
    try {
      const result = await recorder.stop();
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
        recordedAt: new Date(startedAt.current || Date.now()).toISOString(),
      });
      afterLocalWrite();
      const who = fixedSkier?.name ?? guess?.name;
      toast({
        title: who ? `Saved for ${who}` : "Saved to inbox",
        description: who
          ? "The transcript will be polished when there's signal."
          : "No skier recognized yet. AI will try when there's signal, or assign it yourself.",
      });
    } catch (err) {
      toast({
        title: "Recording problem",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      phaseRef.current = "idle";
      setLiveText("");
      setPhase("idle");
    }
  }
  finishRef.current = finish;

  const recording = phase === "recording";
  const busy = phase === "starting" || phase === "saving";

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm">
      <div className="flex items-center gap-4">
        <button
          onClick={recording ? finish : begin}
          disabled={busy}
          aria-label={recording ? "Stop recording" : "Start recording"}
          className={cn(
            "w-20 h-20 shrink-0 rounded-full shadow-lg flex items-center justify-center transition-colors",
            recording ? "bg-red-500 animate-pulse" : "bg-accent",
            busy && "opacity-60",
          )}
        >
          {recording ? <Square className="text-white" size={30} /> : <Mic className="text-white" size={34} />}
        </button>
        <div className="min-w-0">
          <h3 className="text-lg font-medium text-neutral-800">
            {fixedSkier ? `Note for ${fixedSkier.name}` : "Quick voice note"}
          </h3>
          <p className="text-sm text-neutral-600">
            {phase === "starting" && "Starting…"}
            {phase === "saving" && "Saving…"}
            {recording && `Recording ${formatDuration(elapsed)} · tap to stop`}
            {phase === "idle" &&
              (fixedSkier ? "Tap to record. Works offline." : "Say the skier's name and it's filed for you. Works offline.")}
          </p>
        </div>
      </div>

      {recording && (
        <div className="mt-4 bg-neutral-50 rounded-lg p-3 min-h-[3rem]">
          <p className="text-neutral-800 text-sm">
            {liveText ||
              (liveAvailable ? "Listening…" : "Recording audio. Transcript will be created when there's signal.")}
          </p>
        </div>
      )}
    </div>
  );
}
