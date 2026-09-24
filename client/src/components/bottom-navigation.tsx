import { Home, Mic, Settings, Square } from "lucide-react";
import { useLocation } from "wouter";
import { useLocal } from "@/app/hooks";
import { listSkiers } from "@/data/repo";
import { formatDuration, useVoiceRecording } from "@/voice/use-voice-recording";
import { saveRecordingAsNote, SKI_HINTS } from "@/voice/save-note";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface BottomNavigationProps {
  active: "home" | "settings";
}

function NavItem({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: typeof Home;
  label: string;
  active: boolean;
  onClick(): void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center space-y-1 py-2 px-3 transition-colors",
        active ? "text-primary" : "text-neutral-400 hover:text-neutral-600",
      )}
    >
      <Icon size={22} />
      <span className={cn("text-xs", active && "font-medium")}>{label}</span>
    </button>
  );
}

// Bottom bar with the quick voice-note button raised in the middle. Notes are
// filed under whichever skier is named, and saved even with no signal.
export default function BottomNavigation({ active }: BottomNavigationProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: skiers = [] } = useLocal(["skiers"], listSkiers);
  const rec = useVoiceRecording({
    hints: () => [...skiers.map((s) => s.name), ...SKI_HINTS],
    onResult: async (result, startedAt) => {
      toast(await saveRecordingAsNote(result, startedAt, skiers));
    },
  });

  return (
    <>
      {(rec.recording || rec.phase === "saving") && (
        <div className="fixed left-4 right-4 z-40 bottom-[calc(env(safe-area-inset-bottom)+6.5rem)] bg-white rounded-xl shadow-lg border border-neutral-200 p-4">
          <p className="text-sm font-medium text-red-600">
            {rec.recording ? `Recording ${formatDuration(rec.elapsed)} · tap the mic to stop` : "Saving…"}
          </p>
          <p className="text-neutral-800 text-sm mt-1 min-h-[1.25rem]">
            {rec.liveText ||
              (rec.liveAvailable
                ? "Listening… say the skier's name and it's filed for you."
                : "Recording audio. Transcript will be created when there's signal.")}
          </p>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-neutral-200 px-4 pt-2 safe-bottom z-40">
        <div className="grid grid-cols-3 items-end">
          <div className="flex justify-center">
            <NavItem icon={Home} label="Skiers" active={active === "home"} onClick={() => setLocation("/")} />
          </div>
          <div className="flex justify-center">
            <button
              onClick={rec.toggle}
              disabled={rec.busy}
              aria-label={rec.recording ? "Stop recording" : "Record a voice note"}
              className={cn(
                "-mt-9 mb-1 w-20 h-20 rounded-full border-4 border-white shadow-xl flex items-center justify-center transition-colors",
                rec.recording ? "bg-red-500 animate-pulse" : "bg-accent",
                rec.busy && "opacity-60",
              )}
            >
              {rec.recording ? <Square className="text-white" size={30} /> : <Mic className="text-white" size={36} />}
            </button>
          </div>
          <div className="flex justify-center">
            <NavItem
              icon={Settings}
              label="Settings"
              active={active === "settings"}
              onClick={() => setLocation("/settings")}
            />
          </div>
        </div>
      </nav>
    </>
  );
}
