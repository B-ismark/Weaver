import "server-only";
import type { CandidateItem, CandidateSource } from "../types";
import { fetchJsonResilient } from "../fetch";

/**
 * Wikimedia Commons discovery source (free, NO key, no IP wall, CC-licensed).
 *
 * One API call per query returns thumbnail URL + true dims via the generator=search
 * pattern (namespace 6 = File). Images are served from upload.wikimedia.org, an
 * open CDN that doesn't block datacenter IPs. feed_by_taste re-ranks against the
 * taste centroids, so the query terms just seed breadth.
 */
const QUERIES = [
  "landscape painting",
  "portrait photography",
  "architecture photograph",
  "abstract art",
  "still life",
  "minimalism design",
];
const PER = 20;
const THUMB_W = 843; // requested thumbnail width (feed-sized)

type WmImageInfo = { thumburl?: string; thumbwidth?: number; thumbheight?: number; descriptionurl?: string };
type WmPage = { title?: string; imageinfo?: WmImageInfo[] };
type WmResponse = { query?: { pages?: Record<string, WmPage> } };

async function search(q: string): Promise<CandidateItem[]> {
  const url =
    `https://commons.wikimedia.org/w/api.php?action=query&generator=search` +
    `&gsrsearch=${encodeURIComponent(q)}&gsrnamespace=6&gsrlimit=${PER}` +
    `&prop=imageinfo&iiprop=url|size&iiurlwidth=${THUMB_W}&format=json`;
  const json = await fetchJsonResilient<WmResponse>(url, {
    headers: { "User-Agent": "weaver-personal-aggregator/0.1 (discovery)", Accept: "application/json" },
  });
  const pages = json?.query?.pages;
  if (!pages) return [];

  const out: CandidateItem[] = [];
  for (const page of Object.values(pages)) {
    const info = page.imageinfo?.[0];
    const img = info?.thumburl;
    // Commons ns6 also holds audio/video/svg — keep only raster thumbnails.
    if (!img || !/\.(jpg|jpeg|png|webp)$/i.test(img)) continue;
    out.push({
      imageUrl: img,
      sourceLink: info?.descriptionurl || img,
      caption: (page.title || "").replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, "").slice(0, 300),
      source: "wikimedia",
      width: info?.thumbwidth,
      height: info?.thumbheight,
    });
  }
  return out;
}

export const wikimediaSource: CandidateSource = {
  name: "wikimedia",
  async pull(): Promise<CandidateItem[]> {
    const batches = await Promise.all(QUERIES.map((q) => search(q).catch(() => [] as CandidateItem[])));
    return batches.flat();
  },
};
