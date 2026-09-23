import { QueryClient } from "@tanstack/react-query";

// All screens read from the on-device database, never straight from the
// network, so queries run regardless of connectivity and are refreshed by
// invalidating the "local" key after writes and syncs.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: "always",
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      networkMode: "always",
      retry: false,
    },
  },
});
