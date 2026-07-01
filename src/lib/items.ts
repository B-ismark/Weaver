import "server-only";
import type { FeedItem } from "./feed";
import type { Platform } from "@/ingestion/types";
import { getServerSupabase } from "@/lib/supabase/server";

/**
 * Reads from the store. The feed ranks by taste centroids when embeddings +
 * centroids exist (§8.3), else by recency. Detail + "more like this" use the
 * pgvector RPCs (§8.4). All return safe fallbacks so the UI never crashes.
 */
const DEFAULT_THUMB_W = 400;
const DEFAULT_THUMB_H = 500;

const ITEM_COLUMNS =
  "id, platform, image_url, thumb_url, thumb_width, thumb_height, source_link, caption, role";

type ItemRow = {
  id: string;
  platform: string;
  image_url: string;
  thumb_url: string | null;
  thumb_width: number | null;
  thumb_height: number | null;
  source_link: string;
  caption: string | null;
  role?: string | null; // 'taste' = in the taste set (saved/liked); 'candidate' = discovered
  score?: number | null; // present from feed_by_taste / items_like (migration 0015)
};

function rowToFeedItem(row: ItemRow): FeedItem {
  return {
    id: String(row.id),
    thumbUrl: row.thumb_url ?? row.image_url,
    fullUrl: row.image_url,
    sourceLink: row.source_link,
    caption: row.caption ?? "",
    platform: row.platform as Platform,
    width: row.thumb_width ?? DEFAULT_THUMB_W,
    height: row.thumb_height ?? DEFAULT_THUMB_H,
    // Only carry a real number through; the RPC returns it post-0015, absent before.
    score: typeof row.score === "number" ? row.score : undefined,
    // Saved/liked = already in the taste set. Absent from RPC rows (treated false).
    saved: row.role === "taste",
  };
}

function client() {
  try {
    return getServerSupabase();
  } catch {
    return null; // env not set
  }
}

/**
 * Feed tuning knobs (migrations 0016 + 0017), overridable via env without a
 * redeploy of the SQL. Omitted keys fall back to the function's SQL defaults.
 *   FEED_SEEN_GRACE_HOURS — how long a seen candidate stays eligible (6h).
 *   FEED_HIDE_SIMILARITY  — cosine above which a candidate is suppressed as
 *                           "like" something you hid (0.85).
 *   FEED_MIN_AESTHETIC    — hard quality floor 0..10 (0 = off). Drops known-low
 *                           images; never drops un-scored (NULL) rows.
 */
function feedTuning(): Record<string, number> {
  const params: Record<string, number> = {};
  const grace = Number(process.env.FEED_SEEN_GRACE_HOURS);
  const hideSim = Number(process.env.FEED_HIDE_SIMILARITY);
  const minAes = Number(process.env.FEED_MIN_AESTHETIC);
  if (Number.isFinite(grace)) params.seen_grace_hours = grace;
  if (Number.isFinite(hideSim)) params.hide_similarity = hideSim;
  if (Number.isFinite(minAes)) params.min_aesthetic = minAes;
  return params;
}

// A seen candidate is eligible again after this many hours (matches the SQL
// default). The adaptive backfill below relaxes it to "effectively forever" so a
// power-user who out-scrolls the fresh supply still gets a full page instead of a
// half-empty one — freshness is preferred, but never at the cost of an empty feed.
const FOREVER_HOURS = 1_000_000;

/**
 * Home / infinite-scroll feed: taste-ranked when possible, recency otherwise.
 *
 * @param limit   page size.
 * @param exclude ids already shown THIS session (for "load more" — the SQL skips
 *                them so pages don't repeat despite the per-call randomisation).
 */
export async function getFeedItems(limit = 60, exclude: string[] = []): Promise<FeedItem[]> {
  const supabase = client();
  if (!supabase) return [];

  const base = { match_count: limit, exclude_ids: exclude, ...feedTuning() };

  // Try taste ranking, preferring fresh (unseen) candidates.
  const ranked = await supabase.rpc("feed_by_taste", base);
  let rows: ItemRow[] = !ranked.error && ranked.data ? (ranked.data as ItemRow[]) : [];

  // DECOUPLE FRESHNESS FROM SUPPLY: if the fresh pool can't fill the page, top up
  // from the seen pool (grace relaxed) rather than showing a stub. Only when the
  // caller didn't override the grace window explicitly.
  if (rows.length < limit && process.env.FEED_SEEN_GRACE_HOURS === undefined) {
    const seenIds = new Set(rows.map((r) => String(r.id)));
    const fill = await supabase.rpc("feed_by_taste", {
      ...base,
      match_count: limit,
      seen_grace_hours: FOREVER_HOURS,
      exclude_ids: [...exclude, ...seenIds],
    });
    if (!fill.error && fill.data) {
      for (const r of fill.data as ItemRow[]) {
        if (rows.length >= limit) break;
        if (!seenIds.has(String(r.id))) {
          rows.push(r);
          seenIds.add(String(r.id));
        }
      }
    }
  }

  if (rows.length) return rows.map(rowToFeedItem);

  // No centroids yet (cold start) → recency.
  const recent = await supabase
    .from("items")
    .select(ITEM_COLUMNS)
    .order("engaged_at", { ascending: false })
    .limit(limit);
  if (recent.error || !recent.data) return [];
  rows = recent.data as ItemRow[];
  if (exclude.length) rows = rows.filter((r) => !exclude.includes(String(r.id)));
  return rows.map(rowToFeedItem);
}

/** Library: your taste set — imported + saved/promoted items (already "seen"). */
export async function getLibraryItems(limit = 100): Promise<FeedItem[]> {
  const supabase = client();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("items")
    .select(ITEM_COLUMNS)
    .eq("role", "taste")
    .order("engaged_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return (data as ItemRow[]).map(rowToFeedItem);
}

/** Single item for the detail view. */
export async function getItemById(id: string): Promise<FeedItem | null> {
  const supabase = client();
  if (!supabase) return null;
  const { data, error } = await supabase.from("items").select(ITEM_COLUMNS).eq("id", id).single();
  if (error || !data) return null;
  return rowToFeedItem(data as ItemRow);
}

/** "More like this" — nearest neighbours by image embedding (§6.1). */
export async function getSimilarItems(id: string, limit = 20): Promise<FeedItem[]> {
  const supabase = client();
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("items_like", { target: id, match_count: limit });
  if (error || !data) return [];
  return (data as ItemRow[]).map(rowToFeedItem);
}

/** Semantic search — query is a CLIP text-tower embedding as a pgvector literal. */
export async function searchByVector(vectorLiteral: string, limit = 40): Promise<FeedItem[]> {
  const supabase = client();
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("search_items", {
    query: vectorLiteral,
    match_count: limit,
  });
  if (error || !data) return [];
  return (data as ItemRow[]).map(rowToFeedItem);
}
