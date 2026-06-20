// Verifies D3 feed polish (migration 0007) on LIVE data — read-only, no mutation.
//
//   1. EXPLORATION: same call twice with explore_frac=0 must be identical
//      (deterministic ranking); with explore_frac>0 successive calls must differ
//      (random slice); explore_frac=1 should differ the most.
//   2. DIVERSITY: assign each returned item to its nearest centroid and print the
//      histogram. The old max-cosine ranker skewed hard to one cluster; the
//      round-robin should spread across most/all centroids.
//
// Run AFTER applying supabase/migrations/0007_feed_polish.sql in the SQL editor.
// Usage: node scripts/test-feed-polish.mjs
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

const ids = (r) => (r.error ? null : r.data.map((x) => x.id));
const overlap = (a, b) => a.filter((x) => b.includes(x)).length / Math.max(a.length, 1);
const parseVec = (s) => (Array.isArray(s) ? s : JSON.parse(s)).map(Number);
const cos = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) d += a[i] * b[i]; return d; };

async function feed(frac) {
  const r = await sb.rpc("feed_by_taste", { match_count: 60, explore_frac: frac });
  if (r.error) throw new Error(`RPC error (did you run 0007?): ${r.error.message}`);
  return r.data;
}

// --- 1. exploration ------------------------------------------------------
const det1 = ids(await sb.rpc("feed_by_taste", { match_count: 60, explore_frac: 0 }));
const det2 = ids(await sb.rpc("feed_by_taste", { match_count: 60, explore_frac: 0 }));
if (!det1) throw new Error("feed_by_taste(explore_frac=0) failed — apply 0007 first");
console.log(`explore_frac=0  → ${det1.length} rows, two calls identical: ${overlap(det1, det2) === 1}`);

const exp = 0.2;
const e1 = ids(await sb.rpc("feed_by_taste", { match_count: 60, explore_frac: exp }));
const e2 = ids(await sb.rpc("feed_by_taste", { match_count: 60, explore_frac: exp }));
console.log(`explore_frac=${exp} → membership overlap across two calls: ${(overlap(e1, e2) * 100).toFixed(0)}% (expect <100, ~exploit-fraction stable)`);

const f1 = ids(await sb.rpc("feed_by_taste", { match_count: 60, explore_frac: 1 }));
const f2 = ids(await sb.rpc("feed_by_taste", { match_count: 60, explore_frac: 1 }));
console.log(`explore_frac=1  → overlap across two calls: ${(overlap(f1, f2) * 100).toFixed(0)}% (expect lowest)`);

// --- 2. diversity --------------------------------------------------------
const { data: cents } = await sb.from("taste_centroids").select("id, centroid");
console.log(`\ncentroids: ${cents.length}`);
const C = cents.map((c) => ({ id: c.id, v: parseVec(c.centroid) }));

const rows = await feed(0); // pure ranking — measure cluster spread of the exploit feed
const got = await sb.from("items").select("id, embedding").in("id", rows.map((r) => r.id));
const embById = new Map(got.data.map((r) => [r.id, parseVec(r.embedding)]));

const hist = new Map();
for (const r of rows) {
  const e = embById.get(r.id);
  if (!e) continue;
  let best = null, bs = -2;
  for (const c of C) { const s = cos(e, c.v); if (s > bs) { bs = s; best = c.id; } }
  hist.set(best, (hist.get(best) ?? 0) + 1);
}
console.log("nearest-centroid histogram (diversity):");
[...hist.entries()].sort((a, b) => b[1] - a[1]).forEach(([id, n]) =>
  console.log(`  ${id.slice(0, 8)} : ${"#".repeat(n)} ${n}`)
);
console.log(`clusters represented: ${hist.size}/${C.length}`);
