import { SecureStorage } from "@aparajita/capacitor-secure-storage";
import type { AuthMode, AuthResponse } from "@shared/sync";
import { uuid } from "./ids";

// Everything sensitive (sign-in token, the coach's own OpenAI key) lives in the
// iOS Keychain via SecureStorage; on the web build it falls back to
// localStorage. Values are cached in memory after load().

export interface SessionState {
  deviceId: string;
  token: string | null;
  mode: AuthMode | null;
  expiresAt: string | null;
  openaiKey: string | null;
  apiBaseOverride: string | null;
  // The coach chose to use the app before signing in.
  offlineStart: boolean;
}

const KEYS = {
  deviceId: "deviceId",
  auth: "auth",
  openaiKey: "openaiKey",
  apiBase: "apiBase",
  offlineStart: "offlineStart",
};

let state: SessionState = {
  deviceId: "",
  token: null,
  mode: null,
  expiresAt: null,
  openaiKey: null,
  apiBaseOverride: null,
  offlineStart: false,
};
const listeners = new Set<() => void>();

function emit() {
  state = { ...state };
  listeners.forEach((l) => l());
}

export const session = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  get(): SessionState {
    return state;
  },

  async load() {
    await SecureStorage.setKeyPrefix("skicoach_");
    let deviceId = await SecureStorage.getItem(KEYS.deviceId);
    if (!deviceId) {
      deviceId = uuid();
      await SecureStorage.setItem(KEYS.deviceId, deviceId);
    }
    const authRaw = await SecureStorage.getItem(KEYS.auth);
    let auth: { token: string; mode: AuthMode; expiresAt: string } | null = null;
    try {
      auth = authRaw ? JSON.parse(authRaw) : null;
    } catch {
      auth = null;
    }
    state = {
      deviceId,
      token: auth?.token ?? null,
      mode: auth?.mode ?? null,
      expiresAt: auth?.expiresAt ?? null,
      openaiKey: await SecureStorage.getItem(KEYS.openaiKey),
      apiBaseOverride: await SecureStorage.getItem(KEYS.apiBase),
      offlineStart: (await SecureStorage.getItem(KEYS.offlineStart)) === "1",
    };
    emit();
  },

  apiBase(): string {
    const base = state.apiBaseOverride || import.meta.env.VITE_API_BASE || "";
    return base.replace(/\/+$/, "");
  },

  async setSignedIn(auth: AuthResponse) {
    await SecureStorage.setItem(
      KEYS.auth,
      JSON.stringify({ token: auth.token, mode: auth.mode, expiresAt: auth.expiresAt }),
    );
    state.token = auth.token;
    state.mode = auth.mode;
    state.expiresAt = auth.expiresAt;
    emit();
  },

  // Keeps local data and the queue; the next sign-in on this device continues
  // the same account (the account id is the device id).
  async signOut() {
    await SecureStorage.removeItem(KEYS.auth);
    state.token = null;
    state.mode = null;
    state.expiresAt = null;
    emit();
  },

  async setOpenAIKey(key: string | null) {
    if (key) await SecureStorage.setItem(KEYS.openaiKey, key);
    else await SecureStorage.removeItem(KEYS.openaiKey);
    state.openaiKey = key;
    emit();
  },

  async setApiBaseOverride(url: string | null) {
    if (url) await SecureStorage.setItem(KEYS.apiBase, url);
    else await SecureStorage.removeItem(KEYS.apiBase);
    state.apiBaseOverride = url;
    emit();
  },

  async setOfflineStart(value: boolean) {
    if (value) await SecureStorage.setItem(KEYS.offlineStart, "1");
    else await SecureStorage.removeItem(KEYS.offlineStart);
    state.offlineStart = value;
    emit();
  },
};
