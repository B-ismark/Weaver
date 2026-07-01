import "server-only";
import type { CandidateItem, CandidateSource } from "./types";
import { getServerSupabase } from "@/lib/supabase/server";
import { embedImages, toPgVector } from "@/lib/embedImage";

/**
 * Discovery refresh (v2 D1, weaver-discovery-spec.md §6).
 *   pull → dedup vs already-stored → embed (HF Space) → store as candidates
 *
 * Candidates are NOT thumb-cached (§10.1): we hotlink the source image and store
 * URL + embedding + dims. feed_by_taste ranks them against the taste centroids
 * live, so no per-item score is precomputed here.
 *
 * Cross-taste "already seen" dedup (vs the user's saved pHashes) is deferred to
 * D2; for now we only dedup against previously-stored candidates by image URL.
 */
export interface DiscoveryReport {
  source: string;
  pulled: number;
  fresh: number; // not already stored
  embedded: number; // got a vector
  stored: number;
}

// Bound embeddings per refresh (§10.2). On serverless (Vercel Hobby = 60s hard
// cap) a big batch + HF Space cold start blows the limit, so keep it small and
// let the daily cron accumulate. Tunable via env for a longer-limit host.
const EMBED_CAP = Number(process.env.DISCOVERY_EMBED_CAP) || 30;

export async function runDiscovery(source: CandidateSource): Promise<DiscoveryReport> {
  const supabase = getServerSupabase();

  // 1. pull
  const pulled = await source.pull();

  // 2. dedup within batch + against stored items by image_url
  const byUrl = new Map<string, CandidateItem>();
  for (const c of pulled) if (!byUrl.has(c.imageUrl)) byUrl.set(c.imageUrl, c);
  const urls = [...byUrl.keys()];

  const existing = new Set<string>();
  for (let i = 0; i < urls.length; i += 200) {
    const slice = urls.slice(i, i + 200);
    const { data } = await supabase.from("items").select("image_url").in("image_url", slice);
    for (const r of data ?? []) existing.add(r.image_url);
  }
  const fresh = [...byUrl.values()].filter((c) => !existing.has(c.imageUrl)).slice(0, EMBED_CAP);

  // 3. embed via the HF Space (also returns true dims, source-agnostic)
  const results = await embedImages(fresh.map((c) => c.imageUrl));

  // 4. store the ones that embedded
  const rows = fresh
    .map((c, i) => ({ c, r: results[i] }))
    .filter(({ r }) => r !== null)
    .map(({ c, r }) => ({
      platform: c.source, // origin (reddit/arena/…)
      engagement: null, // candidates carry no engagement signal
      role: "candidate" as const,
      image_url: c.imageUrl,
      thumb_url: c.imageUrl, // hotlink; not cached (§10.1)
      thumb_width: r!.width || c.width || null, // Space dims, else source, else null
      thumb_height: r!.height || c.height || null,
      source_link: c.sourceLink,
      caption: c.caption,
      embedding: toPgVector(r!.embedding),
      aesthetic: r!.aesthetic, // LAION quality score (null if Space head unavailable)
    }));

  let stored = 0;
  if (rows.length) {
    // Upsert (not insert) so a URL that raced in from a concurrent sweep is
    // dropped silently instead of erroring the batch. The image_url unique index
    // (migration 0020) is the real dedup guarantee; the pre-insert existing-check
    // above just trims most work before we spend embeddings. ignoreDuplicates =
    // ON CONFLICT DO NOTHING, so .select only returns the rows actually inserted.
    const { data, error } = await supabase
      .from("items")
      .upsert(rows, { onConflict: "image_url", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(`discovery store failed: ${error.message}`);
    stored = data?.length ?? 0;
  }

  return {
    source: source.name,
    pulled: pulled.length,
    fresh: fresh.length,
    embedded: results.filter(Boolean).length,
    stored,
  };
}
