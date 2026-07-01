import "server-only";
import type { CandidateItem, CandidateSource } from "../types";
import { fetchJsonResilient } from "../fetch";

/**
 * Art Institute of Chicago discovery source (free, NO key, no IP wall).
 *
 * A fully open, keyless art API that serves from datacenter-friendly infra — the
 * $0 answer to sources that wall Vercel's IPs (Reddit/ArtStation). One search
 * call returns `image_id` directly (no per-object N+1), and images are served via
 * IIIF: `{iiif_url}/{image_id}/full/{width},/0/default.jpg`.
 *
 * Query terms seed an aesthetic spread; feed_by_taste re-ranks against the taste
 * centroids anyway, so breadth here just widens the candidate pool. Routed through
 * fetchJsonResilient for the free jina fallback (harmless — this API rarely blocks).
 */
// Wide, aesthetically diverse terms. Every query runs each sweep and the batch is
// capped (EMBED_CAP), so a deep list just gives a bigger well: as the top results
// get deduped over successive runs, fresh picks keep surfacing from lower down.
const QUERIES = [
  "landscape",
  "portrait",
  "abstract",
  "architecture",
  "still life",
  "japanese print",
  "textile design",
  "modern photography",
  "impressionism",
  "surrealism",
  "cityscape",
  "botanical illustration",
  "ceramics",
  "sculpture",
  "seascape",
  "figure drawing",
  "poster design",
  "art nouveau",
  "geometric abstraction",
  "night scene",
];
const PER = 20;
const IMG_WIDTH = 843; // IIIF render width; good for the masonry feed
const IIIF_FALLBACK = "https://www.artic.edu/iiif/2";

type AicSearch = {
  data?: { id: number; title?: string; image_id?: string | null }[];
  config?: { iiif_url?: string };
};

async function search(q: string): Promise<CandidateItem[]> {
  const url = `https://api.artic.edu/api/v1/artworks/search?q=${encodeURIComponent(
    q
  )}&fields=id,title,image_id&limit=${PER}`;
  const json = await fetchJsonResilient<AicSearch>(url, {
    headers: { "User-Agent": "weaver-personal-aggregator/0.1 (discovery)", Accept: "application/json" },
  });
  if (!json?.data) return [];

  const iiif = json.config?.iiif_url || IIIF_FALLBACK;
  const out: CandidateItem[] = [];
  for (const a of json.data) {
    if (!a.image_id) continue; // no image asset → skip
    out.push({
      imageUrl: `${iiif}/${a.image_id}/full/${IMG_WIDTH},/0/default.jpg`,
      sourceLink: `https://www.artic.edu/artworks/${a.id}`,
      caption: (a.title || "").slice(0, 300),
      source: "artic",
      // dims omitted — the Space returns true dims when it embeds
    });
  }
  return out;
}

export const articSource: CandidateSource = {
  name: "artic",
  async pull(): Promise<CandidateItem[]> {
    const batches = await Promise.all(QUERIES.map((q) => search(q).catch(() => [] as CandidateItem[])));
    return batches.flat();
  },
};
