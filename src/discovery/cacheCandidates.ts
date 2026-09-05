import "server-only";
import { getServerSupabase } from "@/lib/supabase/server";
import { cacheImageVariants } from "@/lib/imageCache";

/**
 * Discovery candidate thumbnail cache (image-cache plan, Phase 1).
 *
 * Candidates come in hotlinked (discovery/refresh.ts sets thumb_url =
 * image_url, deliberately not cached — see §10.1 there). That means every
 * feed tile is served unoptimized, full-size, straight from whatever CDN the
 * source happens to use — including the ones already known to wall/rate-limit
 * (ArtStation, Reddit; see discovery/fetch.ts). This sweep closes that gap
 * using the same fetch→resize→upload primitive the import pipeline already
 * uses for a user's own connected accounts (sharpThumbnail.ts): once
 * thumb_url points at our storage, imageHost.shouldOptimize treats it as
 * optimizable automatically — no component changes needed.
 *
 * A failing row (dead URL, source now blocking us) backs off via
 * thumb_cache_attempts instead of being retried forever.
 */
const BUCKET = "thumbnails";
const THUMB = { suffix: "thumb", width: 400, quality: 78 };
const MAX_ATTEMPTS = 3;

export interface CacheFillReport {
  scanned: number;
  cached: number;
  failed: number;
}

export async function cacheCandidateThumbnails(batchSize = 100): Promise<CacheFillReport> {
  const supabase = getServerSupabase();

  const { data: rows, error } = await supabase
    .from("items")
    .select("id, image_url, platform")
    .eq("role", "candidate")
    .eq("thumb_cached", false)
    .eq("hidden", false)
    .lt("thumb_cache_attempts", MAX_ATTEMPTS)
    .order("created_at", { ascending: false })
    .limit(batchSize);
  if (error) throw new Error(`cache-fill query failed: ${error.message}`);

  let cached = 0;
  let failed = 0;

  for (const row of rows ?? []) {
    try {
      const variants = await cacheImageVariants(row.image_url, [THUMB], {
        bucket: BUCKET,
        pathPrefix: row.platform,
      });
      const thumb = variants[THUMB.suffix];

      const { error: updateErr } = await supabase
        .from("items")
        .update({
          thumb_url: thumb.url,
          thumb_width: thumb.width,
          thumb_height: thumb.height,
          thumb_cached: true,
          thumb_cache_error: null,
        })
        .eq("id", row.id);
      if (updateErr) throw new Error(updateErr.message);
      cached++;
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      // Bumps attempts atomically so a batch that hits the same dead row twice
      // (two sweeps before the attempt cap trips) can't race on a read-modify-write.
      await supabase.rpc("bump_thumb_cache_failure", { item_id: row.id, err: message });
    }
  }

  return { scanned: rows?.length ?? 0, cached, failed };
}
