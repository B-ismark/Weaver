import "server-only";
import type { CandidateItem, CandidateSource } from "../types";
import { fetchJsonResilient } from "../fetch";
import { getTasteSeeds } from "../seeds";

/**
 * NASA Image Library — images-api.nasa.gov (free, NO key, no IP wall). Deep well
 * of high-quality public-domain photography (earth, space, macro, aerial). One
 * call per seed. Assets are served from images-assets.nasa.gov, which serves
 * datacenter IPs fine. Dims aren't in the search response → the Space fills them.
 * Docs: https://api.nasa.gov/ (NASA Image and Video Library)
 */
const PER = 20;
const IMG = /\.(jpg|jpeg|png|webp)(\?|$)/i;

type NasaLink = { href?: string; rel?: string; render?: string };
type NasaItem = {
  data?: { title?: string; nasa_id?: string; media_type?: string }[];
  links?: NasaLink[];
};
type NasaResponse = { collection?: { items?: NasaItem[] } };

async function search(q: string): Promise<CandidateItem[]> {
  const url = `https://images-api.nasa.gov/search?q=${encodeURIComponent(q)}&media_type=image&page_size=${PER}`;
  const json = await fetchJsonResilient<NasaResponse>(url, {
    headers: { "User-Agent": "weaver-personal-aggregator/0.1 (discovery)", Accept: "application/json" },
  });
  const out: CandidateItem[] = [];
  for (const item of json?.collection?.items ?? []) {
    const meta = item.data?.[0];
    if (meta?.media_type && meta.media_type !== "image") continue;
    // Prefer an explicit image link; else the first raster link.
    const link =
      item.links?.find((l) => l.render === "image" && l.href && IMG.test(l.href)) ??
      item.links?.find((l) => l.href && IMG.test(l.href));
    if (!link?.href) continue;
    out.push({
      imageUrl: link.href,
      sourceLink: meta?.nasa_id ? `https://images.nasa.gov/details-${meta.nasa_id}` : link.href,
      caption: (meta?.title || "").slice(0, 300),
      source: "nasa",
    });
  }
  return out;
}

export const nasaSource: CandidateSource = {
  name: "nasa",
  async pull(): Promise<CandidateItem[]> {
    const seeds = await getTasteSeeds(8);
    const batches = await Promise.all(seeds.map((s) => search(s).catch(() => [] as CandidateItem[])));
    return batches.flat();
  },
};
