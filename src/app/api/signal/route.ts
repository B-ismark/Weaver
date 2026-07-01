import { getServerSupabase } from "@/lib/supabase/server";
import { parsePgVector } from "@/lib/kmeans";
import { pullTowardCentroid, softSteerCentroid } from "@/lib/tasteSteer";

/**
 * POST /api/signal — explicit feedback on a feed item (discovery spec §9).
 *   - "save"   : strong positive. Promote candidate → taste set AND nudge the
 *                nearest taste centroid toward it, so the feed sharpens
 *                immediately (full re-cluster via /api/recluster).
 *   - "unsave" : reverse a save. Demote taste → candidate (centroid drift is
 *                corrected by the next full re-cluster).
 *   - "hide"   : negative ("not my taste"). Excluded from the feed.
 *   - "unhide" : reverse a hide.
 *   - "more"   : SOFT positive. Nudge the nearest centroid a small step TOWARD the
 *                item — steers the feed without promoting the item or removing the
 *                tile. Cheaper than a save, richer than nothing.
 *   - "less"   : SOFT negative. Nudge the nearest centroid a small step AWAY from
 *                the item — steers the feed off that style without hiding the tile
 *                or hard-suppressing everything similar (what "hide" does).
 *
 * Also logs an engagement event for the (parked) learned ranker.
 */
type Action = "save" | "unsave" | "hide" | "unhide" | "more" | "less";

/** Read an item's embedding as a number[], or null. */
async function itemVector(
  supabase: ReturnType<typeof getServerSupabase>,
  itemId: string
): Promise<number[] | null> {
  const { data } = await supabase.from("items").select("embedding").eq("id", itemId).single();
  if (!data?.embedding) return null;
  return parsePgVector(data.embedding as string);
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

  // Row patch for the hard actions. Soft actions (more/less) don't touch the row.
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

  const isSoft = action === "more" || action === "less";
  if (!patch && !isSoft) {
    return Response.json({ error: `unknown action ${action}` }, { status: 422 });
  }

  if (patch) {
    const { error } = await supabase.from("items").update(patch).eq("id", itemId);
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  // Taste steering:
  //   save → running-mean pull (strong).  more/less → fractional soft steer.
  if (action === "save" || action === "more" || action === "less") {
    const vec = await itemVector(supabase, itemId).catch(() => null);
    if (vec) {
      if (action === "save") await pullTowardCentroid(supabase, vec).catch(() => {});
      else await softSteerCentroid(supabase, vec, action === "more" ? 1 : -1).catch(() => {});
    }
  }

  // best-effort engagement log for the parked ranker (soft signals weighted 0.3).
  const evType =
    action === "save" || action === "more"
      ? "save"
      : action === "hide" || action === "less"
        ? "dismiss"
        : null;
  if (evType) {
    const value = isSoft ? 0.3 : 1;
    await supabase.from("engagement_events").insert({ item_id: itemId, type: evType, value }).then(
      () => {},
      () => {}
    );
  }

  return Response.json({ ok: true });
}
