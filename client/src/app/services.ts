import { App as CapApp } from "@capacitor/app";
import { Network } from "@capacitor/network";
import { createNativeDb, createSqlJsDb, type SqlDb } from "@/data/sql";
import { migrate } from "@/data/schema";
import { session } from "@/lib/session";
import { idbGet, idbPut } from "@/lib/idb";
import { createApi, type Api } from "@/sync/api";
import { SyncEngine } from "@/sync/engine";
import { isNative, readAudio } from "@/voice/recorder";
import { queryClient } from "@/lib/queryClient";

export interface Services {
  db: SqlDb;
  api: Api;
  engine: SyncEngine;
}

let services: Services | null = null;

export function getServices(): Services {
  if (!services) throw new Error("Services not initialized");
  return services;
}

export function refreshLocalQueries() {
  return queryClient.invalidateQueries({ queryKey: ["local"] });
}

// Call after any local write: the UI updates straight away and the sync
// engine tries to send the change (or quietly queues it if offline).
export function afterLocalWrite() {
  void refreshLocalQueries();
  if (services) void services.engine.requestSync();
}

async function createWebDb(): Promise<SqlDb> {
  const [{ default: initSqlJs }, { default: wasmUrl }] = await Promise.all([
    import("sql.js"),
    import("sql.js/dist/sql-wasm.wasm?url"),
  ]);
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const saved = await idbGet<Uint8Array>("db", "main").catch(() => undefined);
  const database = saved ? new SQL.Database(saved) : new SQL.Database();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const save = () => {
    timer = null;
    void idbPut("db", "main", database.export());
  };
  const persist = () => {
    if (!timer) timer = setTimeout(save, 300);
  };
  window.addEventListener("pagehide", save);
  return createSqlJsDb(database, persist);
}

export async function initServices(): Promise<Services> {
  if (services) return services;
  await session.load();
  const db = isNative() ? await createNativeDb("skicoach") : await createWebDb();
  await migrate(db);

  const api = createApi({
    baseUrl: () => session.apiBase(),
    token: () => session.get().token,
    openaiKey: () => session.get().openaiKey,
  });

  const engine = new SyncEngine({
    db,
    api,
    isSignedIn: () => !!session.get().token,
    readAudio,
    onDataChanged: () => void refreshLocalQueries(),
  });
  services = { db, api, engine };

  const status = await Network.getStatus().catch(() => ({ connected: true }));
  await engine.setOnline(status.connected);
  void Network.addListener("networkStatusChange", (s) => void engine.setOnline(s.connected));

  // iOS gives apps no reliable background time, so sync whenever the coach
  // opens the app again.
  if (isNative()) {
    void CapApp.addListener("appStateChange", ({ isActive }) => {
      if (isActive) void engine.flushNow();
    });
  } else {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void engine.flushNow();
    });
  }

  await engine.refreshCounts();
  void engine.requestSync();
  return services;
}
