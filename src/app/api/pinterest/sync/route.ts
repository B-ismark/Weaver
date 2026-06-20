import { fetchSavedPins, isConnected } from "@/lib/pinterest";
import { embedImages, toPgVector } from "@/lib/embedImage";
import { getServerSupabase } from "@/lib/supabase/server";

// Embedding via the HF Space is slow; request the max serverless budget
// (Vercel Hobby ceiling is 60s — CAP is sized to fit).
export const maxDuration = 60;

/**
 * POST /api/pinterest/sync — pull the user's saved pins as taste signal (D4).
 * Cron-triggerable (GitHub Actions); guarded by CRON_SECRET when set.
 *
 *   fetch saved pins → dedup vs stored (by image_url) → embed (HF Space) →
 *   store as role='taste' items (hidden from feed, steer the centroids).
 *
 * Pins hotlink i.pinimg.com (whitelisted in next.config) — no thumb caching,
 * same as discovery candidates (§10.1). Run /api/recluster afterward so the new
 * signal updates the centroids (the cron workflow chains the two).
 */
// Bound pins pulled + embedded per sync (§10.2). Small for serverless (Vercel
// Hobby 60s); the daily cron catches up over runs. Tunable via env.
const CAP = Number(process.env.PINTEREST_SYNC_CAP) || 48;

export async function POST(): Promise<Response> {
  if (!(await isConnected())) {
    return Response.json(
      { error: "Pinterest not connected — authorize at /api/pinterest/auth" },
      { status: 409 }
    );
  }

  try {
    const pins = await fetchSavedPins(CAP);

    // dedup within batch + against stored items by image_url
    const byUrl = new Map<string, (typeof pins)[number]>();
    for (const p of pins) if (!byUrl.has(p.imageUrl)) byUrl.set(p.imageUrl, p);
    const urls = [...byUrl.keys()];

    const supabase = getServerSupabase();
    const existing = new Set<string>();
    for (let i = 0; i < urls.length; i += 200) {
      const slice = urls.slice(i, i + 200);
      const { data } = await supabase.from("items").select("image_url").in("image_url", slice);
      for (const r of data ?? []) existing.add(r.image_url);
    }
    const fresh = [...byUrl.values()].filter((p) => !existing.has(p.imageUrl));

    // embed (also returns true dims)
    const results = await embedImages(fresh.map((p) => p.imageUrl));
    const rows = fresh
      .map((p, i) => ({ p, r: results[i] }))
      .filter(({ r }) => r !== null)
      .map(({ p, r }) => ({
        platform: "pinterest",
        engagement: "saved",
        role: "taste" as const,
        image_url: p.imageUrl,
        thumb_url: p.imageUrl, // hotlink i.pinimg.com (whitelisted); not cached
        thumb_width: r!.width || null,
        thumb_height: r!.height || null,
        source_link: p.sourceLink,
        caption: p.caption,
        embedding: toPgVector(r!.embedding),
        engaged_at: p.timestamp,
      }));

    let stored = 0;
    if (rows.length) {
      const { data, error } = await supabase.from("items").insert(rows).select("id");
      if (error) throw new Error(`pinterest sync store failed: ${error.message}`);
      stored = data?.length ?? 0;
    }

    return Response.json({
      ok: true,
      pulled: pins.length,
      fresh: fresh.length,
      embedded: results.filter(Boolean).length,
      stored,
      reclusterRecommended: stored > 0,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Pinterest sync failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
