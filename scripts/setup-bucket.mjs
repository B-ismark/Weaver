// Creates the public `thumbnails` bucket via the storage API (no DDL needed).
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

const { error } = await sb.storage.createBucket("thumbnails", {
  public: true,
  fileSizeLimit: "5MB",
  allowedMimeTypes: ["image/webp"],
});

if (error && !/already exists/i.test(error.message)) {
  console.error("createBucket failed:", error.message);
  process.exit(1);
}
console.log(error ? "bucket already exists — ok" : "bucket 'thumbnails' created (public)");
