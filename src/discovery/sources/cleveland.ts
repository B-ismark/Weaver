import "server-only";
import type { CandidateItem, CandidateSource } from "../types";
import { fetchJsonResilient } from "../fetch";
import { getTasteSeeds } from "../seeds";

/**
 * Cleveland Museum of Art — Open Access API (free, NO key, CC0 imagery, no IP
 * wall). One call per seed returns web-sized image URLs with true dims. Images
 * are served from an open cache CDN that serves datacenter IPs fine.
 * Docs: https://openaccess-api.clevelandart.org/
 */
const PER = 20;

type ClevelandImage = { url?: string; width?: string | number; height?: string | number };
type ClevelandArt = {
  title?: string;
  url?: string; // artwork page
  images?: { web?: ClevelandImage; print?: ClevelandImage; full?: ClevelandImage };
};
type ClevelandResponse = { data?: ClevelandArt[] };

function num(v: string | number | undefined): number | undefined {
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? (n as number) : undefined;
}

async function search(q: string): Promise<CandidateItem[]> {
  const url =
    `https://openaccess-api.clevelandart.org/api/artworks/?q=${encodeURIComponent(q)}` +
    `&has_image=1&cc0=1&limit=${PER}&skip=0`;
  const json = await fetchJsonResilient<ClevelandResponse>(url, {
    headers: { "User-Agent": "weaver-personal-aggregator/0.1 (discovery)", Accept: "application/json" },
  });
  const out: CandidateItem[] = [];
  for (const art of json?.data ?? []) {
    const img = art.images?.web ?? art.images?.print ?? art.images?.full;
    if (!img?.url) continue;
    out.push({
      imageUrl: img.url,
      sourceLink: art.url || img.url,
      caption: (art.title || "").slice(0, 300),
      source: "cleveland",
      width: num(img.width),
      height: num(img.height),
    });
  }
  return out;
}

export const clevelandSource: CandidateSource = {
  name: "cleveland",
  async pull(): Promise<CandidateItem[]> {
    const seeds = await getTasteSeeds(8);
    const batches = await Promise.all(seeds.map((s) => search(s).catch(() => [] as CandidateItem[])));
    return batches.flat();
  },
};
