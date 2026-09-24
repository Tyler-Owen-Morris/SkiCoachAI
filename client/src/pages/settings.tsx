import { useState } from "react";
import { useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, KeyRound, LogIn, LogOut, RefreshCw, Server, Trash2 } from "lucide-react";
import { getServices } from "@/app/services";
import { useLocal, useSession, useSyncStatus } from "@/app/hooks";
import { allOps } from "@/data/outbox";
import { session } from "@/lib/session";
import { ApiError } from "@/sync/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import BottomNavigation from "@/components/bottom-navigation";
import SyncBadge from "@/components/sync-badge";
import { useToast } from "@/hooks/use-toast";

const KIND_LABELS: Record<string, string> = {
  skier: "Skier details",
  note: "Note",
  transcribe: "Cloud transcription",
  summary: "AI summary",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl p-5 shadow-sm space-y-3">
      <h2 className="text-base font-semibold text-neutral-800">{title}</h2>
      {children}
    </section>
  );
}

function maskKey(key: string) {
  return key.length > 12 ? `${key.slice(0, 5)}…${key.slice(-4)}` : "••••";
}

export default function Settings() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const s = useSession();
  const status = useSyncStatus();
  const { data: ops = [] } = useLocal(["outbox", status.failed, status.pending, status.aiPending], allOps);
  const failed = ops.filter((o) => o.state === "failed");
  const [keyDraft, setKeyDraft] = useState("");
  const [checking, setChecking] = useState(false);
  const [serverDraft, setServerDraft] = useState(s.apiBaseOverride ?? "");
  const { engine, api } = getServices();

  async function saveKey() {
    const key = keyDraft.trim();
    setChecking(true);
    try {
      if (s.token) await api.checkKey(key);
      await session.setOpenAIKey(key);
      setKeyDraft("");
      toast({ title: "OpenAI key saved", description: "AI features now bill your OpenAI account." });
      void engine.onKeyChanged();
    } catch (err) {
      if (err instanceof ApiError && err.kind === "network") {
        // No signal on the hill: keep it, it'll be checked on first use.
        await session.setOpenAIKey(key);
        setKeyDraft("");
        toast({ title: "Key saved", description: "Couldn't check it without a connection; it'll be tried on next sync." });
        void engine.onKeyChanged();
      } else {
        toast({
          title: "Key not saved",
          description: err instanceof Error ? err.message : String(err),
          variant: "destructive",
        });
      }
    } finally {
      setChecking(false);
    }
  }

  async function removeKey() {
    await session.setOpenAIKey(null);
    void engine.onKeyChanged();
    toast({
      title: "Key removed",
      description: s.mode === "passcode" ? "AI will use the demo key." : "AI features pause until you add a key.",
    });
  }

  async function signOut() {
    await session.signOut();
    await session.setOfflineStart(true);
    await engine.refreshCounts();
    toast({ title: "Signed out", description: "Your notes stay on this phone." });
  }

  async function saveServer() {
    const url = serverDraft.trim();
    await session.setApiBaseOverride(url || null);
    toast({ title: "Server updated" });
    void engine.flushNow();
  }

  const keyStatus = s.openaiKey
    ? `Using your key (${maskKey(s.openaiKey)})`
    : s.mode === "passcode"
      ? "Using the demo key"
      : "No key — AI transcription and summaries are paused";

  return (
    <div className="min-h-screen bg-neutral-50 pb-36">
      <header className="bg-white shadow-sm border-b border-neutral-200 sticky top-0 z-40 safe-top">
        <div className="px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-medium text-neutral-800">Settings</h1>
          <SyncBadge />
        </div>
      </header>

      <main className="p-4 space-y-4">
        <Section title="Sync">
          <div className="text-sm text-neutral-700 space-y-1">
            <p>
              {status.online ? "Connected" : "Offline"} · {status.pending} changes and {status.aiPending} AI jobs
              waiting
            </p>
            <p className="text-neutral-500">
              {status.lastSyncAt
                ? `Last full sync ${formatDistanceToNow(status.lastSyncAt, { addSuffix: true })}`
                : "Not synced yet"}
            </p>
            {status.lastError && <p className="text-amber-700">{status.lastError}</p>}
            {status.aiKeyProblem && <p className="text-amber-700">AI paused: {status.aiKeyProblem}</p>}
          </div>
          <Button variant="outline" onClick={() => void engine.flushNow()} disabled={!s.token}>
            <RefreshCw size={16} className="mr-2" /> Sync now
          </Button>

          {failed.length > 0 && (
            <div className="space-y-2 pt-2">
              <p className="text-sm font-medium text-red-700 flex items-center gap-2">
                <AlertTriangle size={16} /> The server refused {failed.length} item{failed.length > 1 ? "s" : ""}.
                They're still saved on this phone.
              </p>
              {failed.map((op) => (
                <div key={op.seq} className="border border-red-100 rounded-lg p-3 text-sm space-y-2">
                  <p className="text-neutral-800">{KIND_LABELS[op.kind] ?? op.kind}</p>
                  <p className="text-neutral-500 text-xs break-words">{op.lastError}</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => void engine.retryFailed(op.seq)}>
                      Retry
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void engine.discardFailed(op.seq)}>
                      <Trash2 size={14} className="mr-1" /> Don't upload
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="OpenAI key">
          <p className="text-sm text-neutral-700 flex items-center gap-2">
            <KeyRound size={16} /> {keyStatus}
          </p>
          <p className="text-xs text-neutral-500">
            Add your own key to bill transcription and summaries to your OpenAI account. It's stored in this phone's
            Keychain and only sent to the Ski Coach server with each AI request.
          </p>
          <Input
            type="password"
            autoComplete="off"
            autoCapitalize="off"
            placeholder={s.openaiKey ? "Replace key (sk-...)" : "sk-..."}
            value={keyDraft}
            onChange={(e) => setKeyDraft(e.target.value)}
          />
          <div className="flex gap-2">
            <Button disabled={checking || keyDraft.trim().length < 20} onClick={saveKey}>
              {checking ? "Checking…" : "Save key"}
            </Button>
            {s.openaiKey && (
              <Button variant="outline" onClick={removeKey}>
                Remove my key
              </Button>
            )}
          </div>
        </Section>

        <Section title="Account">
          <p className="text-sm text-neutral-700">
            {s.token
              ? s.mode === "passcode"
                ? "Signed in with the demo passcode"
                : "Signed in with your OpenAI key"
              : "Not signed in — notes are kept on this phone only"}
          </p>
          {s.token && !status.authExpired ? (
            <Button variant="outline" onClick={signOut}>
              <LogOut size={16} className="mr-2" /> Sign out
            </Button>
          ) : (
            <Button onClick={() => setLocation("/sign-in")}>
              <LogIn size={16} className="mr-2" /> Sign in
            </Button>
          )}
          {s.token && status.pending + status.aiPending > 0 && (
            <p className="text-xs text-neutral-500">
              Signing out keeps unsynced work on this phone; it uploads next time you sign in.
            </p>
          )}
        </Section>

        <Section title="Server">
          <p className="text-sm text-neutral-700 flex items-center gap-2 break-all">
            <Server size={16} className="shrink-0" /> {session.apiBase() || "Same address as this page"}
          </p>
          <Input
            placeholder="https://your-server.onrender.com"
            autoCapitalize="off"
            value={serverDraft}
            onChange={(e) => setServerDraft(e.target.value)}
          />
          <Button variant="outline" size="sm" onClick={saveServer}>
            Save server address
          </Button>
        </Section>

        <p className="text-center text-xs text-neutral-400">Device {s.deviceId.slice(0, 8)}</p>
      </main>

      <BottomNavigation active="settings" />
    </div>
  );
}
