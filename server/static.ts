import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    // API-only deploy; nothing to serve.
    return;
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
