import { getServerSupabase } from "@/lib/supabase/server";
import { kmeans, clusterCount, parsePgVector } from "@/lib/kmeans";

/**
 * POST /api/recluster — recompute taste centroids from the full taste set
 * (§8.3). Run after a big import, or periodically. Per-save nudges are handled
 * incrementally in /api/signal; this is the authoritative full re-cluster.
 */
export async function POST(): Promise<Response> {
  const supabase = getServerSupabase();

  const { data, error } = await supabase
    .from("items")
    .select("embedding")
    .eq("role", "taste")
    .not("embedding", "is", null);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data || data.length < 2) {
    return Response.json({ error: "not enough taste embeddings to cluster" }, { status: 422 });
  }

  const X = data.map((r) => parsePgVector(r.embedding as string));
  const k = clusterCount(X.length);
  const { centroids, sizes } = kmeans(X, k);

  await supabase.from("taste_centroids").delete().not("id", "is", null);
  const { error: insErr } = await supabase
    .from("taste_centroids")
    .insert(centroids.map((c, i) => ({ centroid: `[${c.join(",")}]`, size: sizes[i] })));
  if (insErr) return Response.json({ error: insErr.message }, { status: 500 });

  return Response.json({ ok: true, clusters: k, sizes, from: X.length });
}
