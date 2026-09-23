import path from "path";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";
import ws from "ws";
import * as schema from "@shared/schema";
import { config } from "./config";

neonConfig.webSocketConstructor = ws;

export const pool = new Pool({ connectionString: config.databaseUrl });
export const db = drizzle({ client: pool, schema });

// Migrations live in /migrations at the repo root, both in dev (server/) and
// in the bundled build (dist/).
export async function runMigrations() {
  await migrate(db, {
    migrationsFolder: path.resolve(import.meta.dirname, "..", "migrations"),
    migrationsTable: "__skicoach_migrations",
  });
}
