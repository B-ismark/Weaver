import "server-only";
import { getServerSupabase } from "@/lib/supabase/server";

/**
 * Candidate retention (image-cache plan, Phase 1): un-liked candidates are
 * throwaway scroll content, not the training signal, so there's no reason to
 * keep the row — or its cached image — around indefinitely. Liking an item
 * promotes it (role → 'taste', promoted = true; see /api/signal), which is
 * exactly what excludes it here: liked photos are the centroid training
 * signal and are kept forever, un-liked ones age out.
 *
 * Storage objects are content-addressed (see imageCache.ts), so the same
 * bytes can legitimately be shared by more than one row (e.g. a liked item
 * whose exact image also showed up as a still-fresh candidate). Refcounting
 * runs BEFORE any row is deleted, so a shared object is never removed while a
 * surviving row (any role) still points at it.
 */
const BUCKET = "thumbnails";
const RETENTION_DAYS = Number(process.env.CANDIDATE_RETENTION_DAYS) || 14;
const BATCH_SIZE = Number(process.env.CANDIDATE_EVICT_BATCH) || 200;

export interface EvictReport {
  deletedRows: number;
  deletedObjects: number;
}

function storagePathFromPublicUrl(url: string): string | null {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const idx = url.indexOf(marker);
  return idx === -1 ? null : url.slice(idx + marker.length);
}

export async function evictStaleCandidates(): Promise<EvictReport> {
  const supabase = getServerSupabase();

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: victims, error } = await supabase
    .from("items")
    .select("id, thumb_url")
    .eq("role", "candidate")
    .eq("promoted", false)
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);
  if (error) throw new Error(`eviction query failed: ${error.message}`);
  if (!victims?.length) return { deletedRows: 0, deletedObjects: 0 };

  const ids = victims.map((v) => v.id);

  // One refcount check per victim (small batches, off-Vercel cron — see
  // .github/workflows/discover.yml — so no time-budget pressure to optimize
  // this into a single query). Excludes the rest of THIS batch from the count:
  // two victims being deleted together can share a content-addressed
  // thumb_url (e.g. the same image reposted to two sources), and counting
  // each other as a live reference would leave the object orphaned in
  // storage forever, since no row will exist afterward to catch it on a
  // later sweep.
  const orphanUrls: string[] = [];
  for (const v of victims) {
    if (!v.thumb_url) continue;
    const { count, error: countErr } = await supabase
      .from("items")
      .select("id", { count: "exact", head: true })
      .eq("thumb_url", v.thumb_url)
      .not("id", "in", `(${ids.join(",")})`);
    if (countErr) throw new Error(`refcount check failed: ${countErr.message}`);
    if ((count ?? 0) === 0) orphanUrls.push(v.thumb_url);
  }
  const { error: delErr } = await supabase.from("items").delete().in("id", ids);
  if (delErr) throw new Error(`eviction delete failed: ${delErr.message}`);

  // Dedupe: two victims can share the same orphaned thumb_url (see above),
  // which would otherwise queue the same storage path for removal twice.
  const paths = [...new Set(orphanUrls)]
    .map(storagePathFromPublicUrl)
    .filter((p): p is string => p !== null);

  let deletedObjects = 0;
  if (paths.length) {
    const { data: removed, error: rmErr } = await supabase.storage.from(BUCKET).remove(paths);
    if (rmErr) throw new Error(`storage cleanup failed: ${rmErr.message}`);
    deletedObjects = removed?.length ?? 0;
  }

  return { deletedRows: ids.length, deletedObjects };
}
