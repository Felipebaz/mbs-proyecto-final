import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit corre fuera de Next, así que no hereda la carga de .env.local.
config({ path: ".env.local" });

export default defineConfig({
  schema: "./lib/db/esquema.ts",
  out: "./lib/db/migraciones",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
  casing: "snake_case",
  verbose: true,
  strict: true,
});
