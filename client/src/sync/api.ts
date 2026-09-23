import {
  OPENAI_KEY_HEADER,
  type AuthResponse,
  type MeResponse,
  type PullResponse,
  type PushOp,
  type PushResponse,
  type SummaryResponse,
  type TranscribeResponse,
} from "@shared/sync";

// How the sync engine should react to a failure.
//  network:   no connection / timeout -> retry with backoff
//  retry:     server or OpenAI hiccup -> retry with backoff
//  auth:      token rejected -> pause the queue until the coach signs in again
//  ai-key:    OpenAI key missing/invalid/out of credit -> keep the work, retry slowly
//  permanent: the server will never accept this -> park it for the coach to review
export type FailureKind = "network" | "retry" | "auth" | "ai-key" | "permanent";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }

  get kind(): FailureKind {
    if (this.status === 0) return "network";
    if (this.status === 401) return "auth";
    if (this.status === 424) return "ai-key";
    if ([408, 409, 425, 429].includes(this.status) || this.status >= 500) return "retry";
    return "permanent";
  }
}

export interface ApiConfig {
  baseUrl(): string;
  token(): string | null;
  openaiKey(): string | null;
}

// A cold server on the free hosting tier can take ~50s to wake up.
const DATA_TIMEOUT_MS = 75_000;
const AI_TIMEOUT_MS = 150_000;

export function createApi(cfg: ApiConfig, fetchImpl: typeof fetch = (...args) => fetch(...args)) {
  async function request<T>(
    path: string,
    init: { method?: string; json?: unknown; form?: FormData; timeoutMs?: number; openaiKey?: string | null } = {},
  ): Promise<T> {
    const headers: Record<string, string> = {};
    const token = cfg.token();
    if (token) headers.Authorization = `Bearer ${token}`;
    // The coach's own OpenAI key only travels on requests that need it.
    const key = init.openaiKey;
    if (key) headers[OPENAI_KEY_HEADER] = key;
    let body: BodyInit | undefined;
    if (init.json !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(init.json);
    } else if (init.form) {
      body = init.form;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? DATA_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetchImpl(`${cfg.baseUrl()}${path}`, {
        method: init.method ?? (body ? "POST" : "GET"),
        headers,
        body,
        signal: controller.signal,
      });
    } catch {
      throw new ApiError(0, "No connection to the server");
    } finally {
      clearTimeout(timer);
    }

    const text = await res.text().catch(() => "");
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!res.ok) {
      throw new ApiError(res.status, data?.message ?? `Server error (${res.status})`, data?.code);
    }
    if (data === null) {
      // e.g. a captive-portal page instead of our API
      throw new ApiError(502, "Unexpected response from server");
    }
    return data as T;
  }

  return {
    health: () => request<{ ok: boolean }>("/api/health", { timeoutMs: DATA_TIMEOUT_MS }),
    signInWithPasscode: (passcode: string, deviceId: string) =>
      request<AuthResponse>("/api/auth/passcode", { json: { passcode, deviceId } }),
    signInWithKey: (openaiKey: string, deviceId: string) =>
      request<AuthResponse>("/api/auth/byok", { json: { deviceId }, openaiKey }),
    checkKey: (openaiKey: string) => request<{ ok: true }>("/api/auth/check-key", { json: {}, openaiKey }),
    me: () => request<MeResponse>("/api/auth/me"),
    push: (ops: PushOp[]) => request<PushResponse>("/api/sync/push", { json: { ops } }),
    pull: (since: string | null) =>
      request<PullResponse>(`/api/sync/pull${since ? `?since=${encodeURIComponent(since)}` : ""}`),
    transcribe: (noteId: string, audio: Blob, fileName: string) => {
      const form = new FormData();
      form.append("audio", audio, fileName);
      return request<TranscribeResponse>(`/api/notes/${encodeURIComponent(noteId)}/transcribe`, {
        form,
        timeoutMs: AI_TIMEOUT_MS,
        openaiKey: cfg.openaiKey(),
      });
    },
    summary: (skierId: string, summaryId: string, requestedAt: string) =>
      request<SummaryResponse>(
        `/api/skiers/${encodeURIComponent(skierId)}/summaries/${encodeURIComponent(summaryId)}`,
        { json: { requestedAt }, timeoutMs: AI_TIMEOUT_MS, openaiKey: cfg.openaiKey() },
      ),
  };
}

export type Api = ReturnType<typeof createApi>;
