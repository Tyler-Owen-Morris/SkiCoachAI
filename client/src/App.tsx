import { useEffect, useState } from "react";
import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { initServices } from "@/app/services";
import { useSession } from "@/app/hooks";
import LoadingOverlay from "@/components/loading-overlay";
import Welcome from "@/pages/welcome";
import Home from "@/pages/home";
import SkierDetail from "@/pages/skier-detail";
import AddSkier from "@/pages/add-skier";
import Settings from "@/pages/settings";
import NotFound from "@/pages/not-found";

function Router() {
  const { token, offlineStart } = useSession();

  // First launch: sign in, or choose to start offline and sign in later.
  if (!token && !offlineStart) return <Welcome />;

  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/skier/:id" component={SkierDetail} />
      <Route path="/add-skier" component={AddSkier} />
      <Route path="/settings" component={Settings} />
      <Route path="/sign-in" component={Welcome} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initServices()
      .then(() => setReady(true))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <h1 className="text-lg font-medium mb-2">Ski Coach AI couldn't start</h1>
          <p className="text-sm text-neutral-600">{error}</p>
        </div>
      </div>
    );
  }
  if (!ready) return <LoadingOverlay />;

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
