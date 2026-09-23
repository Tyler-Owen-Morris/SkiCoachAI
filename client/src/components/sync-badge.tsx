import { useLocation } from "wouter";
import { AlertTriangle, CheckCircle2, CloudOff, KeyRound, LogIn, RefreshCw } from "lucide-react";
import { useSession, useSyncStatus } from "@/app/hooks";
import { cn } from "@/lib/utils";

// Always-visible answer to "is my work safe / has it gone up yet?".
export default function SyncBadge() {
  const status = useSyncStatus();
  const { token } = useSession();
  const [, setLocation] = useLocation();
  const waiting = status.pending + status.aiPending;

  let icon = <CheckCircle2 size={14} />;
  let label = "All synced";
  let tone = "bg-green-50 text-green-700 border-green-200";

  if (!token) {
    icon = <LogIn size={14} />;
    label = waiting ? `Sign in to sync · ${waiting} saved` : "Not signed in";
    tone = "bg-neutral-100 text-neutral-700 border-neutral-200";
  } else if (status.authExpired) {
    icon = <LogIn size={14} />;
    label = "Sign in again";
    tone = "bg-amber-50 text-amber-800 border-amber-200";
  } else if (!status.online) {
    icon = <CloudOff size={14} />;
    label = waiting ? `Offline · ${waiting} waiting` : "Offline";
    tone = "bg-neutral-100 text-neutral-700 border-neutral-200";
  } else if (status.syncing) {
    icon = <RefreshCw size={14} className="animate-spin" />;
    label = waiting ? `Syncing ${waiting}…` : "Syncing…";
    tone = "bg-blue-50 text-blue-700 border-blue-200";
  } else if (status.failed > 0) {
    icon = <AlertTriangle size={14} />;
    label = `${status.failed} need attention`;
    tone = "bg-red-50 text-red-700 border-red-200";
  } else if (status.aiKeyProblem) {
    icon = <KeyRound size={14} />;
    label = "AI paused · check key";
    tone = "bg-amber-50 text-amber-800 border-amber-200";
  } else if (waiting > 0) {
    icon = <CloudOff size={14} />;
    label = `${waiting} waiting`;
    tone = "bg-neutral-100 text-neutral-700 border-neutral-200";
  }

  return (
    <button
      onClick={() => setLocation(!token || status.authExpired ? "/sign-in" : "/settings")}
      className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium", tone)}
      aria-label={`Sync status: ${label}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
