/**
 * Discovery candidate types (v2, weaver-discovery-spec.md §2/§4).
 *
 * A CandidateItem is a NEW external image (not the user's own engagement),
 * pulled from a discovery source, to be embedded and ranked against the taste
 * centroids. Mirrors the normalized ingestion shape but carries display dims
 * (sources give them, so we avoid layout shift without caching — §10.1).
 */
export interface CandidateItem {
  imageUrl: string; // hotlinked, not cached (§10.1)
  sourceLink: string; // link back to the original post
  caption: string;
  source: string; // 'reddit' | 'arena' | 'unsplash' | 'openverse'
  // Dims optional: many sources don't expose them. The Space returns true dims
  // when it embeds (it decodes the image anyway), so these are just a fallback.
  width?: number;
  height?: number;
}

/** A discovery source: pull a batch of fresh candidates. */
export interface CandidateSource {
  readonly name: string;
  pull(): Promise<CandidateItem[]>;
}
