import { getServerSupabase } from "@/lib/supabase/server";
import { parsePgVector } from "@/lib/kmeans";

/**
 * POST /api/signal — explicit feedback on a feed item (discovery spec §9).
 *   - "save"   : strong positive. Promote candidate → taste set AND nudge the
 *                nearest taste centroid toward it, so the feed sharpens
 *                immediately (full re-cluster via /api/recluster).
 *   - "unsave" : reverse a save. Demote taste → candidate (centroid drift is
 *                corrected by the next full re-cluster).
 *   - "hide"   : negative ("not my taste"). Excluded from the feed.
 *   - "unhide" : reverse a hide.
 *
 * Also logs an engagement event for the (parked) learned ranker.
 */
type Action = "save" | "unsave" | "hide" | "unhide";

/**
 * Move the nearest centroid a step toward a newly-saved embedding (running mean
 * proxy). O(k) — cheap per save. Drift is corrected by the periodic full
 * re-cluster. No-op if there are no centroids yet.
 */
async function nudgeCentroid(
  supabase: ReturnType<typeof getServerSupabase>,
  itemId: string
): Promise<void> {
  const { data: item } = await supabase.from("items").select("embedding").eq("id", itemId).single();
  if (!item?.embedding) return;
  const vec = parsePgVector(item.embedding as string);

  const { data: centroids } = await supabase.from("taste_centroids").select("id, centroid, size");
  if (!centroids?.length) return;

  let best = centroids[0];
  let bestSim = -Infinity;
  let bestVec: number[] = [];
  for (const c of centroids) {
    const cv = parsePgVector(c.centroid as string);
    let dot = 0;
    for (let i = 0; i < vec.length; i++) dot += vec[i] * cv[i]; // both unit → cosine
    if (dot > bestSim) {
      bestSim = dot;
      best = c;
      bestVec = cv;
    }
  }

  const size = (best.size as number) ?? 1;
  const merged = bestVec.map((x, i) => (x * size + vec[i]) / (size + 1));
  const norm = Math.sqrt(merged.reduce((s, x) => s + x * x, 0)) || 1;
  const unit = merged.map((x) => x / norm);

  await supabase
    .from("taste_centroids")
    .update({ centroid: `[${unit.join(",")}]`, size: size + 1 })
    .eq("id", best.id);
}

export async function POST(request: Request): Promise<Response> {
  let body: { itemId?: string; action?: Action };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const { itemId, action } = body;
  if (!itemId || !action) return Response.json({ error: "itemId + action required" }, { status: 422 });

  const supabase = getServerSupabase();

  const patch =
    action === "save"
      ? { role: "taste", promoted: true, hidden: false }
      : action === "unsave"
        ? { role: "candidate", promoted: false }
        : action === "hide"
          ? { hidden: true }
          : action === "unhide"
            ? { hidden: false }
            : null;
  if (!patch) return Response.json({ error: `unknown action ${action}` }, { status: 422 });

  const { error } = await supabase.from("items").update(patch).eq("id", itemId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Save → nudge taste toward it so the feed sharpens immediately.
  if (action === "save") await nudgeCentroid(supabase, itemId).catch(() => {});

  // best-effort engagement log (save → save, hide → dismiss)
  const evType = action === "save" ? "save" : action === "hide" ? "dismiss" : null;
  if (evType) {
    await supabase.from("engagement_events").insert({ item_id: itemId, type: evType }).then(
      () => {},
      () => {}
    );
  }

  return Response.json({ ok: true });
}
