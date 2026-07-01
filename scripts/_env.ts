/**
 * Zero-dependency .env.local loader for the standalone scripts.
 *
 * Next.js auto-loads .env.local for the app, but a plain `tsx` script does not.
 * Import this FIRST (before anything that reads process.env) so local runs of
 * scripts/discover.ts and scripts/gallerydl-ingest.ts pick up Supabase / HF Space
 * credentials with no extra flags. In CI the vars are already in the environment
 * and .env.local is absent, so this is a harmless no-op there.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

for (const file of [".env.local", ".env"]) {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) continue;
  for (const rawLine of readFileSync(path, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key || key in process.env) continue; // don't override real env
    let val = line.slice(eq + 1).trim();
    // Strip surrounding quotes if present.
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}
