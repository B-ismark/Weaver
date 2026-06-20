// Hostless taste pipeline: embed taste items via the HF Space, then cluster
// into centroids with plain-JS k-means. No torch / Colab / local ML.
//
// Prereq: HF Space deployed; .env.local has EMBED_ENDPOINT (+ EMBED_TOKEN).
// Usage:  node scripts/backfill-embeddings.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const ENDPOINT = env.EMBED_ENDPOINT?.replace(/\/$/, "");
if (!ENDPOINT) { console.error("Set EMBED_ENDPOINT in .env.local (deploy the HF Space first)."); process.exit(1); }
const authHeaders = env.EMBED_TOKEN ? { Authorization: `Bearer ${env.EMBED_TOKEN}` } : {};
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const BATCH = 64;
const lit = (v) => `[${v.join(",")}]`;
const parseVec = (s) => s.replace(/[[\]]/g, "").split(",").map(Number);

// 1. embed items missing an embedding, via the Space
const { data: pending } = await sb.from("items").select("id,thumb_url,image_url").is("embedding", null);
console.log(`to embed: ${pending.length}`);
for (let i = 0; i < pending.length; i += BATCH) {
  const slice = pending.slice(i, i + BATCH);
  const urls = slice.map((r) => r.thumb_url || r.image_url);
  const res = await fetch(`${ENDPOINT}/embed-image`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify({ urls }),
  });
  if (!res.ok) { console.error(`batch ${i} failed: ${res.status}`); continue; }
  const { embeddings } = await res.json();
  for (let j = 0; j < slice.length; j++) {
    if (embeddings[j]) await sb.from("items").update({ embedding: lit(embeddings[j]) }).eq("id", slice[j].id);
  }
  console.log(`embedded ${Math.min(i + BATCH, pending.length)}/${pending.length}`);
}

// 2. k-means over all embeddings (normalized vectors → Euclidean ≈ cosine)
const { data: rows } = await sb.from("items").select("embedding").not("embedding", "is", null);
if (rows.length < 2) { console.log("not enough embeddings to cluster"); process.exit(0); }
const X = rows.map((r) => parseVec(r.embedding));
const dim = X[0].length;
const k = Math.max(1, Math.min(8, Math.round(Math.sqrt(X.length / 2)), X.length));

function kmeans(data, k, iters = 50) {
  // k-means++ style seeding (first random, rest by distance)
  const centers = [data[Math.floor(Math.random() * data.length)].slice()];
  while (centers.length < k) {
    const d2 = data.map((p) => Math.min(...centers.map((c) => dist2(p, c))));
    const sum = d2.reduce((a, b) => a + b, 0);
    let r = Math.random() * sum;
    let idx = 0;
    while (r > 0 && idx < d2.length) { r -= d2[idx]; idx++; }
    centers.push(data[Math.max(0, idx - 1)].slice());
  }
  let labels = new Array(data.length).fill(0);
  for (let it = 0; it < iters; it++) {
    let moved = false;
    for (let i = 0; i < data.length; i++) {
      let best = 0, bd = Infinity;
      for (let c = 0; c < k; c++) { const d = dist2(data[i], centers[c]); if (d < bd) { bd = d; best = c; } }
      if (labels[i] !== best) { labels[i] = best; moved = true; }
    }
    for (let c = 0; c < k; c++) {
      const members = data.filter((_, i) => labels[i] === c);
      if (!members.length) continue;
      const mean = new Array(dim).fill(0);
      for (const p of members) for (let d = 0; d < dim; d++) mean[d] += p[d];
      for (let d = 0; d < dim; d++) mean[d] /= members.length;
      centers[c] = mean;
    }
    if (!moved && it > 0) break;
  }
  return { centers, labels };
}
function dist2(a, b) { let s = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; } return s; }
function normalize(v) { const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1; return v.map((x) => x / n); }

const { centers, labels } = kmeans(X, k);
const sizes = new Array(k).fill(0);
for (const l of labels) sizes[l]++;

// 3. replace taste_centroids
await sb.from("taste_centroids").delete().not("id", "is", null);
await sb.from("taste_centroids").insert(
  centers.map((c, i) => ({ centroid: lit(normalize(c)), size: sizes[i] }))
);
console.log(`wrote ${k} centroids (sizes=${sizes.join(",")}).`);
console.log("done — feed will now rank by taste.");
