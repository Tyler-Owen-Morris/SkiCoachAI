import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import { createServer } from "http";
import { registerRoutes } from "./routes";
import { runMigrations } from "./db";
import { config } from "./config";
import { log } from "./log";

const app = express();
app.set("trust proxy", 1);

// The iOS app is served from capacitor://localhost (or https://localhost), so
// the API must allow those origins. Auth is a bearer token, not cookies.
const allowedOrigins = new Set([
  "capacitor://localhost",
  "https://localhost",
  "http://localhost",
  "http://localhost:5000",
  "http://localhost:5173",
  ...config.extraCorsOrigins,
]);
app.use((req, res, next) => {
  const origin = req.header("origin");
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization,Content-Type,X-OpenAI-Key");
    res.setHeader("Access-Control-Max-Age", "86400");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// A backlog push of 100 notes is well under this.
app.use(express.json({ limit: "5mb" }));

app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    if (req.path.startsWith("/api")) {
      log(`${req.method} ${req.path} ${res.statusCode} in ${Date.now() - start}ms`);
    }
  });
  next();
});

(async () => {
  await runMigrations();
  registerRoutes(app);
  const server = createServer(app);

  // Only set up Vite in development, after the API routes, so its catch-all
  // doesn't swallow them. In production the built web app is served statically
  // (handy for testing the app in a phone browser).
  if (app.get("env") === "development") {
    // Non-literal path keeps esbuild from bundling Vite into the production build.
    const vitePath = "./vite";
    const { setupVite } = await import(vitePath);
    await setupVite(app, server);
  } else {
    const { serveStatic } = await import("./static");
    serveStatic(app);
  }

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    if (!res.headersSent) {
      res.status(err.status || err.statusCode || 500).json({ message: "Server error" });
    }
  });

  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(port, "0.0.0.0", () => log(`serving on port ${port}`));
})().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
