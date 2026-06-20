// Verifies Phase 2 DB plumbing WITHOUT torch: assigns synthetic unit vectors to
// items, seeds centroids, exercises the three RPCs, prints results, then RESETS
// (embeddings -> null, centroids cleared) so the real embedding run isn't blocked.
//
// Usage: node scripts/test-vectors.mjs        (assign + test + reset)
//        node scripts/test-vectors.mjs --keep  (assign + test, no reset)
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});
const DIM = 512;
const keep = process.argv.includes("--keep");

// Deterministic pseudo-random unit vector from a seed (no Math.random needed).
function unitVec(seed) {
  let s = seed * 2654435761 >>> 0;
  const v = new Array(DIM);
  let norm = 0;
  for (let i = 0; i < DIM; i++) {
    s = (s * 1103515245 + 12345) >>> 0;
    const x = (s / 0xffffffff) * 2 - 1;
    v[i] = x; norm += x * x;
  }
  norm = Math.sqrt(norm);
  return v.map((x) => x / norm);
}
const lit = (v) => `[${v.map((x) => x.toFixed(7)).join(",")}]`;

const { data: items } = await sb.from("items").select("id").order("engaged_at");
console.log("items:", items.length);

// 1. assign synthetic embeddings
for (let i = 0; i < items.length; i++) {
  await sb.from("items").update({ embedding: lit(unitVec(i + 1)) }).eq("id", items[i].id);
}
console.log("assigned synthetic embeddings");

// 2. seed 2 centroids (use two item vectors as cluster centers)
await sb.from("taste_centroids").delete().not("id", "is", null);
await sb.from("taste_centroids").insert([
  { centroid: lit(unitVec(1)), size: 3 },
  { centroid: lit(unitVec(4)), size: 3 },
]);
console.log("seeded 2 centroids");

// 3. exercise RPCs
const feed = await sb.rpc("feed_by_taste", { match_count: 60 });
console.log("feed_by_taste ->", feed.error ? `ERR ${feed.error.message}` : `${feed.data.length} rows`);

const like = await sb.rpc("items_like", { target: items[0].id, match_count: 20 });
console.log("items_like ->", like.error ? `ERR ${like.error.message}` : `${like.data.length} rows (excl self)`);

const search = await sb.rpc("search_items", { query: lit(unitVec(2)), match_count: 40 });
console.log("search_items ->", search.error ? `ERR ${search.error.message}` : `${search.data.length} rows`);

// 4. reset unless --keep
if (!keep) {
  await sb.from("items").update({ embedding: null }).not("id", "is", null);
  await sb.from("taste_centroids").delete().not("id", "is", null);
  console.log("reset: embeddings nulled, centroids cleared (clean for real run)");
} else {
  console.log("--keep: left synthetic vectors in place");
}
