/**
 * Weaver — normalized ingestion types (§4.5)
 *
 * The single contract every source funnels into. APIs, export files — all
 * produce NormalizedItem[]. Nothing downstream (embedding, ranking, feed)
 * knows or cares where an item came from.
 */

/** Platforms Weaver ingests from. */
export type Platform = "pinterest" | "twitter" | "threads" | "instagram";

/**
 * The engagement signal that caused this item to be ingested (§3).
 * Locked per platform — see SIGNAL_BY_PLATFORM.
 */
export type EngagementSignal = "saved" | "liked" | "retweeted";

/** Locked signal per platform (§3 "Signal definitions"). */
export const SIGNAL_BY_PLATFORM: Record<Platform, EngagementSignal> = {
  pinterest: "saved",
  twitter: "retweeted",
  threads: "liked",
  instagram: "liked",
};

/**
 * One ingested image, normalized. This is the §4.5 shape, with the few fields
 * Weaver needs to dedup, cache, embed, and source-out.
 *
 * v1 is images-only (§3): an item with no usable image is never produced —
 * the parser drops it before this stage.
 */
export interface NormalizedItem {
  /** Full-resolution source image URL. Hotlinked on detail view (§5.2). May expire. */
  imageUrl: string;

  /** Canonical link back to the original post/pin on the source platform (§2 source-out). */
  sourceLink: string;

  /** Display-only caption/title. NOT used as a content type in v1 (§3). May be empty. */
  caption: string;

  /** Which platform this came from. */
  platform: Platform;

  /** The engagement signal. Must equal SIGNAL_BY_PLATFORM[platform]. */
  engagementSignal: EngagementSignal;

  /**
   * When the user engaged with the item, if the source exposes it (ISO 8601).
   * Falls back to import time when the source gives nothing.
   */
  timestamp: string;

  /**
   * Stable cross-source identity for dedup. Same image saved on Pinterest and
   * Instagram should collapse to one. Filled by the dedup step, not the parser
   * (see DEDUP_NOTE). Optional at parse time.
   */
  dedupKey?: string;
}

/**
 * DEDUP_NOTE: dedup is a post-parse step, not the parser's job. Strategy
 * (per spec suggestion): perceptual hash (pHash) of the fetched thumbnail, or
 * embedding-distance collapse. The parser leaves dedupKey undefined; the
 * pipeline fills it after thumbnails are cached (§5.1) so the bytes exist to
 * hash. Kept here so the field is part of the contract from day one.
 */
