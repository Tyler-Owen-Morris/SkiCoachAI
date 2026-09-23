import { defineConfig } from "drizzle-kit";

// `npm run db:generate` works offline; the server applies migrations on boot.
export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  schemaFilter: ["skicoach"],
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
