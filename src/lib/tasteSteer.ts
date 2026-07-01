import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parsePgVector } from "@/lib/kmeans";

/**
 * Shared taste-centroid steering (used by /api/signal and URL ingest).
 *
 * The v1 ranker is cosine-to-centroids (§8.3). These helpers move a centroid in
 * response to a signal so the feed reacts immediately, between the periodic full
 * re-clusters that correct any accumulated drift. All vectors are unit-length
 * (OpenCLIP L2-normalised), so dot product == cosine.
 */

type CentroidRow = { id: string; centroid: unknown; size: number | null };

function unitLiteral(v: number[]): string {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return `[${v.map((x) => x / norm).join(",")}]`;
}

function nearest(
  vec: number[],
  rows: CentroidRow[]
): { id: string; vec: number[]; size: number } | null {
  if (!rows.length) return null;
  let best = { id: rows[0].id, vec: [] as number[], size: 0 };
  let bestSim = -Infinity;
  for (const c of rows) {
    const cv = parsePgVector(c.centroid as string);
    let dot = 0;
    for (let i = 0; i < vec.length; i++) dot += vec[i] * cv[i];
    if (dot > bestSim) {
      bestSim = dot;
      best = { id: c.id, vec: cv, size: (c.size as number) ?? 1 };
    }
  }
  return best;
}

async function loadCentroids(supabase: SupabaseClient): Promise<CentroidRow[]> {
  const { data } = await supabase.from("taste_centroids").select("id, centroid, size");
  return (data as CentroidRow[]) ?? [];
}

/**
 * Strong pull: fold the embedding into the nearest centroid as a running mean and
 * bump its size (used on save / explicit taste add). No-op if no centroids yet.
 */
export async function pullTowardCentroid(supabase: SupabaseClient, vec: number[]): Promise<void> {
  const near = nearest(vec, await loadCentroids(supabase));
  if (!near) return;
  const merged = near.vec.map((x, i) => (x * near.size + vec[i]) / (near.size + 1));
  await supabase
    .from("taste_centroids")
    .update({ centroid: unitLiteral(merged), size: near.size + 1 })
    .eq("id", near.id);
}

/**
 * Soft steer: move the nearest centroid a FRACTION (rate) toward (dir=+1) or away
 * (dir=-1) from the embedding, WITHOUT changing its size. Used by more/less like
 * this — a gentle, non-destructive nudge.
 */
export async function softSteerCentroid(
  supabase: SupabaseClient,
  vec: number[],
  dir: 1 | -1,
  rate = 0.15
): Promise<void> {
  const near = nearest(vec, await loadCentroids(supabase));
  if (!near) return;
  const stepped = near.vec.map((x, i) => x + rate * dir * (vec[i] - x));
  await supabase.from("taste_centroids").update({ centroid: unitLiteral(stepped) }).eq("id", near.id);
}
