import crypto from "crypto";
import type { Express, NextFunction, Request, Response } from "express";
import { z } from "zod";
import { OPENAI_KEY_HEADER, type AuthMode, type AuthResponse, type MeResponse } from "@shared/sync";
import { storage } from "./storage";
import { serverKeyAvailable, validateOpenAIKey } from "./ai";
import { config } from "./config";

// Tokens are long-lived on purpose: a coach must not get signed out halfway
// down a mountain with a backlog of unsynced notes.
const TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

interface TokenPayload {
  sub: string;
  mode: AuthMode;
  exp: number;
}

export interface AuthedRequest extends Request {
  coachId: string;
  authMode: AuthMode;
  userOpenAIKey: string | null;
}

function b64url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

function sign(data: string) {
  return crypto.createHmac("sha256", config.tokenSecret).update(data).digest("base64url");
}

export function issueToken(coachId: string, mode: AuthMode): AuthResponse {
  const exp = Date.now() + TOKEN_TTL_MS;
  const body = b64url(JSON.stringify({ sub: coachId, mode, exp } satisfies TokenPayload));
  return {
    token: `${body}.${sign(body)}`,
    coachId,
    mode,
    expiresAt: new Date(exp).toISOString(),
  };
}

export function verifyToken(token: string): TokenPayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = Buffer.from(sign(body));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as TokenPayload;
    if (typeof payload.sub !== "string" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function safeEqual(a: string, b: string) {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function readUserKey(req: Request): string | null {
  const key = req.header(OPENAI_KEY_HEADER)?.trim();
  return key ? key : null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    return res.status(401).json({ message: "Not signed in" });
  }
  const authed = req as AuthedRequest;
  authed.coachId = payload.sub;
  authed.authMode = payload.mode;
  authed.userOpenAIKey = readUserKey(req);
  next();
}

const deviceIdSchema = z.string().min(8).max(64).regex(/^[A-Za-z0-9-]+$/);
const passcodeBody = z.object({ passcode: z.string().min(1).max(200), deviceId: deviceIdSchema });
const byokBody = z.object({ deviceId: deviceIdSchema });

// Crude brute-force guard for the shared passcode.
const failedPasscodeAttempts = new Map<string, { count: number; resetAt: number }>();
function tooManyFailures(ip: string) {
  const entry = failedPasscodeAttempts.get(ip);
  return !!entry && entry.resetAt > Date.now() && entry.count >= 10;
}
function recordFailure(ip: string) {
  const now = Date.now();
  const entry = failedPasscodeAttempts.get(ip);
  if (!entry || entry.resetAt < now) {
    failedPasscodeAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
  } else {
    entry.count++;
  }
}

// Express 4 doesn't catch rejected promises from async handlers; an uncaught
// rejection (e.g. the database blipping) would crash the whole server.
const safe =
  (handler: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    handler(req, res).catch(next);

export function registerAuthRoutes(app: Express) {
  app.post("/api/auth/passcode", safe(async (req, res) => {
    const parsed = passcodeBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid request" });
    if (!config.demoPasscode) {
      return res.status(403).json({ message: "Passcode sign-in is disabled on this server" });
    }
    const ip = req.ip ?? "unknown";
    if (tooManyFailures(ip)) {
      return res.status(429).json({ message: "Too many attempts. Try again in 15 minutes." });
    }
    if (!safeEqual(parsed.data.passcode.trim(), config.demoPasscode)) {
      recordFailure(ip);
      return res.status(403).json({ message: "Incorrect passcode" });
    }
    await storage.upsertCoach(parsed.data.deviceId, "passcode");
    res.json(issueToken(parsed.data.deviceId, "passcode"));
  }));

  app.post("/api/auth/byok", safe(async (req, res) => {
    const parsed = byokBody.safeParse(req.body);
    const key = readUserKey(req);
    if (!parsed.success || !key) {
      return res.status(400).json({ message: "A device id and an OpenAI API key are required" });
    }
    const check = await validateOpenAIKey(key);
    if (!check.ok) return res.status(check.status).json({ message: check.message });
    await storage.upsertCoach(parsed.data.deviceId, "byok");
    res.json(issueToken(parsed.data.deviceId, "byok"));
  }));

  // Lets the Settings screen test a key before saving it.
  app.post("/api/auth/check-key", requireAuth, safe(async (req, res) => {
    const key = readUserKey(req);
    if (!key) return res.status(400).json({ message: "No key provided" });
    const check = await validateOpenAIKey(key);
    if (!check.ok) return res.status(check.status).json({ message: check.message });
    res.json({ ok: true });
  }));

  app.get("/api/auth/me", requireAuth, safe(async (req, res) => {
    const { coachId, authMode } = req as AuthedRequest;
    await storage.touchCoach(coachId, authMode);
    const body: MeResponse = {
      coachId,
      mode: authMode,
      serverKeyAvailable: authMode === "passcode" && serverKeyAvailable(),
    };
    res.json(body);
  }));
}
