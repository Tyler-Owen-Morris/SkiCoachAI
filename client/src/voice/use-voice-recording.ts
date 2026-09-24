import { useEffect, useRef, useState } from "react";
import { recorder, type RecordingResult } from "./recorder";
import { useToast } from "@/hooks/use-toast";

export type RecordingPhase = "idle" | "starting" | "recording" | "saving";

interface Options {
  // Vocabulary hints for on-device recognition (skier names, ski terms).
  hints(): string[];
  // Called once recording stops; the phase stays "saving" until it resolves.
  onResult(result: RecordingResult, startedAt: number): Promise<void>;
}

export function formatDuration(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// Start/stop lifecycle shared by every record button: permission prompt,
// live transcript, timer, interruptions (calls, Siri) and never leaving the
// mic running when the coach navigates away.
export function useVoiceRecording(options: Options) {
  const [phase, setPhase] = useState<RecordingPhase>("idle");
  const [liveText, setLiveText] = useState("");
  const [liveAvailable, setLiveAvailable] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);
  const phaseRef = useRef<RecordingPhase>("idle");
  const mounted = useRef(true);
  const { toast } = useToast();

  // Callbacks registered once (unmount cleanup, recorder interruption) must
  // use the latest options, not the ones from the first render.
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const finishRef = useRef<() => Promise<void>>(async () => undefined);

  useEffect(() => {
    if (phase !== "recording") return;
    const id = setInterval(() => setElapsed(Date.now() - startedAt.current), 250);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (phaseRef.current === "recording") void finishRef.current();
    };
  }, []);

  const set = (next: RecordingPhase) => {
    phaseRef.current = next;
    if (mounted.current) setPhase(next);
  };

  async function begin() {
    // Guard against a double tap landing before the re-render disables the button.
    if (phaseRef.current !== "idle") return;
    set("starting");
    try {
      const allowed = await recorder.ensurePermission();
      if (!allowed) {
        set("idle");
        toast({
          title: "Microphone is off",
          description: "Allow microphone access for Ski Coach AI in the iPhone Settings app.",
          variant: "destructive",
        });
        return;
      }
      setLiveText("");
      const info = await recorder.start(optionsRef.current.hints(), {
        onPartial: (text) => mounted.current && setLiveText(text),
        onInterrupted: () => {
          if (phaseRef.current === "recording") void finishRef.current();
        },
      });
      startedAt.current = Date.now();
      phaseRef.current = "recording";
      if (!mounted.current) {
        // The coach left while the mic was starting: keep what was captured
        // rather than leaving the mic running with nobody to stop it.
        void finishRef.current();
        return;
      }
      setLiveAvailable(info.transcribing);
      setElapsed(0);
      setPhase("recording");
    } catch (err) {
      set("idle");
      toast({
        title: "Couldn't start recording",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  }

  async function finish() {
    if (phaseRef.current !== "recording") return;
    set("saving");
    try {
      const result = await recorder.stop();
      await optionsRef.current.onResult(result, startedAt.current || Date.now());
    } catch (err) {
      toast({
        title: "Recording problem",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      if (mounted.current) setLiveText("");
      set("idle");
    }
  }
  finishRef.current = finish;

  return {
    phase,
    recording: phase === "recording",
    busy: phase === "starting" || phase === "saving",
    liveText,
    liveAvailable,
    elapsed,
    toggle: () => (phaseRef.current === "recording" ? finish() : begin()),
  };
}
