import "server-only";
import type { StorePort, StorableItem } from "../pipeline";
import { getServerSupabase } from "@/lib/supabase/server";

/**
 * StorePort (§8): upsert rows into `items`, keyed by dedup_key so re-imports and
 * cross-platform duplicates collapse instead of piling up. Returns the number of
 * rows written.
 *
 * pgvector note: embeddings serialize as the textual vector form '[a,b,c]'.
 * Phase 1 embeddings are null; Phase 2 will pass real 512-vectors.
 */
function toRow(it: StorableItem) {
  return {
    platform: it.platform,
    engagement: it.engagementSignal,
    image_url: it.imageUrl,
    thumb_url: it.thumbUrl,
    thumb_width: it.width,
    thumb_height: it.height,
    source_link: it.sourceLink,
    caption: it.caption,
    dedup_key: it.dedupKey ?? null,
    embedding: it.embedding ? `[${it.embedding.join(",")}]` : null,
    engaged_at: it.timestamp,
  };
}

export const supabaseStore: StorePort = {
  async store(rows: StorableItem[]): Promise<number> {
    if (rows.length === 0) return 0;
    const supabase = getServerSupabase();

    // Cross-run dedup: skip rows whose dedup_key already exists. (Within-run
    // dups are already collapsed by aHashDedup.) We query-then-insert rather
    // than ON CONFLICT because dedup_key's unique index is partial, which
    // PostgREST can't use as a conflict target. The partial index still guards
    // against the rare concurrent-insert race.
    const keys = rows.map((r) => r.dedupKey).filter((k): k is string => !!k);
    const existing = new Set<string>();
    if (keys.length) {
      const { data, error } = await supabase
        .from("items")
        .select("dedup_key")
        .in("dedup_key", keys);
      if (error) throw new Error(`store dedup-check failed: ${error.message}`);
      for (const row of data ?? []) if (row.dedup_key) existing.add(row.dedup_key);
    }

    const fresh = rows.filter((r) => !r.dedupKey || !existing.has(r.dedupKey));
    if (fresh.length === 0) return 0;

    const { data, error } = await supabase.from("items").insert(fresh.map(toRow)).select("id");
    if (error) throw new Error(`store failed: ${error.message}`);
    return data?.length ?? 0;
  },
};
