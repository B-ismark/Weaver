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
 * Feed tuning knobs (migration 0016), overridable via env without a redeploy of
 * the SQL. Omitted keys fall back to the function's SQL defaults (6h / 0.85).
 *   FEED_SEEN_GRACE_HOURS — how long a seen candidate stays eligible.
 *   FEED_HIDE_SIMILARITY  — cosine above which a candidate is suppressed as
 *                           "like" something you hid.
 */
function feedTuning(): Record<string, number> {
  const params: Record<string, number> = {};
  const grace = Number(process.env.FEED_SEEN_GRACE_HOURS);
  const hideSim = Number(process.env.FEED_HIDE_SIMILARITY);
  if (Number.isFinite(grace)) params.seen_grace_hours = grace;
  if (Number.isFinite(hideSim)) params.hide_similarity = hideSim;
  return params;
}

/** Home feed: taste-ranked when possible, recency otherwise. */
export async function getFeedItems(limit = 60): Promise<FeedItem[]> {
  const supabase = client();
  if (!supabase) return [];

  // Try taste ranking first (returns [] when no centroids yet).
  const ranked = await supabase.rpc("feed_by_taste", { match_count: limit, ...feedTuning() });
  if (!ranked.error && ranked.data?.length) {
    return (ranked.data as ItemRow[]).map(rowToFeedItem);
  }

  const recent = await supabase
    .from("items")
    .select(ITEM_COLUMNS)
    .order("engaged_at", { ascending: false })
    .limit(limit);
  if (recent.error || !recent.data) return [];
  return (recent.data as ItemRow[]).map(rowToFeedItem);
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
