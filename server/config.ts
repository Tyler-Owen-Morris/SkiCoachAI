function required(name: string, devFallback?: string): string {
  const value = process.env[name];
  if (value) return value;
  if (devFallback !== undefined && process.env.NODE_ENV !== "production") return devFallback;
  throw new Error(`${name} must be set`);
}

export const config = {
  databaseUrl: required("DATABASE_URL"),
  tokenSecret: required("TOKEN_SECRET", process.env.SESSION_SECRET ?? "dev-only-token-secret"),
  // Shared demo passcode. When unset, only bring-your-own-key sign-in works.
  demoPasscode: process.env.DEMO_PASSCODE?.trim() || null,
  // Our key. Only used for coaches who signed in with the passcode.
  openaiApiKey: process.env.OPENAI_API_KEY?.trim() || null,
  transcribeModel: process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-transcribe",
  textModel: process.env.OPENAI_TEXT_MODEL || "gpt-5.6-luna",
  // "none" disables the reasoning parameter for non-reasoning models.
  reasoningEffort: process.env.OPENAI_REASONING_EFFORT || "low",
  // Caps how many AI calls one demo account can make on our key per hour.
  aiCallsPerHour: parseInt(process.env.AI_RATE_LIMIT_PER_HOUR || "120", 10),
  extraCorsOrigins: (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
};
