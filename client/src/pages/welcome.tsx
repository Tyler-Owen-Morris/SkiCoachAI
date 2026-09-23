import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, KeyRound, Lock, Mountain } from "lucide-react";
import { getServices } from "@/app/services";
import { useSession } from "@/app/hooks";
import { session } from "@/lib/session";
import { ApiError } from "@/sync/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Sign-in: the shared demo passcode (AI runs on our server's key), or the
// coach's own OpenAI key (AI billed to them; key stays in the iOS Keychain).
export default function Welcome() {
  const [, setLocation] = useLocation();
  const { deviceId, token, offlineStart } = useSession();
  const [passcode, setPasscode] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const reauth = !!token || offlineStart;

  async function finish(run: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setOffline(false);
    try {
      await run();
      await session.setOfflineStart(false);
      void getServices().engine.onSignedIn();
      setLocation("/");
    } catch (err) {
      if (err instanceof ApiError && err.kind === "network") {
        setOffline(true);
        setError("No connection to the server right now.");
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setBusy(false);
    }
  }

  const signInPasscode = () =>
    finish(async () => {
      const auth = await getServices().api.signInWithPasscode(passcode.trim(), deviceId);
      await session.setSignedIn(auth);
    });

  const signInKey = () =>
    finish(async () => {
      const key = apiKey.trim();
      const auth = await getServices().api.signInWithKey(key, deviceId);
      await session.setOpenAIKey(key);
      await session.setSignedIn(auth);
    });

  async function continueOffline() {
    await session.setOfflineStart(true);
    setLocation("/");
  }

  return (
    <div className="min-h-screen bg-neutral-50 safe-top safe-bottom">
      <div className="max-w-md mx-auto p-6 space-y-6">
        {reauth && (
          <button onClick={() => setLocation("/")} className="flex items-center gap-2 text-neutral-600 text-sm">
            <ArrowLeft size={16} /> Back to my notes
          </button>
        )}
        <div className="text-center space-y-2 pt-6">
          <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mx-auto">
            <Mountain className="text-white" size={32} />
          </div>
          <h1 className="text-2xl font-semibold text-neutral-800">Ski Coach AI</h1>
          <p className="text-neutral-600 text-sm">
            Voice notes on the hill, organized by skier. Works without signal — everything syncs when you're back
            in range.
          </p>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm">
          <Tabs defaultValue="passcode">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="passcode">Demo passcode</TabsTrigger>
              <TabsTrigger value="key">My OpenAI key</TabsTrigger>
            </TabsList>
            <TabsContent value="passcode" className="space-y-3 pt-3">
              <p className="text-sm text-neutral-600">Use the passcode you were given for the demo.</p>
              <Input
                type="password"
                autoComplete="off"
                placeholder="Passcode"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
              />
              <Button className="w-full" disabled={busy || !passcode.trim()} onClick={signInPasscode}>
                <Lock size={16} className="mr-2" /> {busy ? "Signing in…" : "Sign in"}
              </Button>
            </TabsContent>
            <TabsContent value="key" className="space-y-3 pt-3">
              <p className="text-sm text-neutral-600">
                AI transcription and summaries are billed to your own OpenAI account. The key is stored in this
                phone's Keychain.
              </p>
              <Input
                type="password"
                autoComplete="off"
                autoCapitalize="off"
                placeholder="sk-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <Button className="w-full" disabled={busy || apiKey.trim().length < 20} onClick={signInKey}>
                <KeyRound size={16} className="mr-2" /> {busy ? "Checking key…" : "Use my key"}
              </Button>
            </TabsContent>
          </Tabs>
          {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
        </div>

        {(offline || !reauth) && (
          <div className="text-center space-y-2">
            {offline && (
              <p className="text-sm text-neutral-600">
                You can start recording now. Notes are kept on this phone and upload after you sign in.
              </p>
            )}
            <Button variant="ghost" onClick={continueOffline}>
              Continue without signing in
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
