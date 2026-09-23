import { useQuery } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import type { SqlDb } from "@/data/sql";
import { session } from "@/lib/session";
import { getServices } from "./services";

export function useLocal<T>(key: unknown[], read: (db: SqlDb) => Promise<T>) {
  return useQuery({ queryKey: ["local", ...key], queryFn: () => read(getServices().db) });
}

export function useSyncStatus() {
  const { engine } = getServices();
  return useSyncExternalStore(
    (l) => engine.subscribe(l),
    () => engine.getStatus(),
  );
}

export function useSession() {
  return useSyncExternalStore(
    (l) => session.subscribe(l),
    () => session.get(),
  );
}
