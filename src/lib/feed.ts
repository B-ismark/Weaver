import type { Platform } from "@/ingestion/types";

/**
 * Display shape for one feed item — what the UI renders. Derived from a stored
 * row (NormalizedItem + cached thumbnail + embedding) but trimmed to what the
 * grid/detail views need. `width`/`height` are the thumbnail's intrinsic size,
 * carried so cards reserve space and never layout-shift (a11y + efficiency).
 */
export interface FeedItem {
  id: string;
  thumbUrl: string; // cached ~400px WebP (§5.1)
  fullUrl: string; // hotlinked full-res on detail (§5.2)
  sourceLink: string; // click-through to original (§2 source-out)
  caption: string;
  // Free string: taste items use an engagement Platform, discovery candidates a
  // source name ("reddit", "arena", …).
  platform: Platform | string;
  width: number;
  height: number;
  // Taste-match strength in [0,1] (cosine), when the source RPC provides it
  // (feed_by_taste / items_like after migration 0015). Undefined for recency/
  // library reads or before the migration is applied — UI treats it as optional.
  score?: number;
}

/**
 * Phase 0 placeholder data. Deterministic (seeded) so SSR and client agree and
 * the layout is stable across reloads. Replaced by real Supabase rows in Phase 1.
 */
const PLATFORMS: Platform[] = ["pinterest", "twitter", "threads", "instagram"];
const CAPTIONS = [
  "Minimalist interior, soft light",
  "Brutalist concrete facade",
  "Film poster — muted palette",
  "Mountain ridge at dusk",
  "Editorial typography study",
  "Ceramic glaze, earth tones",
  "Street photography, rain",
  "Botanical illustration",
];

export function placeholderFeed(count = 24): FeedItem[] {
  return Array.from({ length: count }, (_, i) => {
    // Vary aspect ratios so the masonry actually staggers.
    const w = 400;
    const h = [300, 500, 600, 400, 700, 450][i % 6];
    return {
      id: `ph-${i}`,
      thumbUrl: `https://picsum.photos/seed/weaver${i}/${w}/${h}`,
      fullUrl: `https://picsum.photos/seed/weaver${i}/1200/${Math.round((h / w) * 1200)}`,
      sourceLink: "https://example.com",
      caption: CAPTIONS[i % CAPTIONS.length],
      platform: PLATFORMS[i % PLATFORMS.length],
      width: w,
      height: h,
    };
  });
}
