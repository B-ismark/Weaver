// Throwaway connectivity probe. Reads .env.local, checks table + bucket.
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

const items = await sb.from("items").select("id").limit(1);
console.log("items:", items.error ? `ERR ${items.error.message}` : `OK (${items.data.length})`);

const events = await sb.from("engagement_events").select("id").limit(1);
console.log("engagement_events:", events.error ? `ERR ${events.error.message}` : `OK (${events.data.length})`);

const buckets = await sb.storage.listBuckets();
console.log(
  "buckets:",
  buckets.error ? `ERR ${buckets.error.message}` : buckets.data.map((b) => b.name).join(", ") || "(none)"
);
