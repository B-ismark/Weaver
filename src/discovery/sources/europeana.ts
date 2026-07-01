import "server-only";
import type { CandidateItem, CandidateSource } from "../types";
import { fetchJsonResilient } from "../fetch";
import { getTasteSeeds } from "../seeds";

/**
 * Europeana — 50M+ cultural-heritage images across Europe's museums/archives.
 * Needs a free API key (instant from https://pro.europeana.eu/get-api), set as
 * EUROPEANA_KEY. If the key is unset the source yields nothing (keyless operation
 * stays intact); it's a bonus well, not a dependency. Reusability is limited to
 * open licences. Thumbnails come from api.europeana.eu (datacenter-safe).
 */
const PER = 20;

type EuropeanaItem = {
  edmPreview?: string[];
  guid?: string;
  title?: string[];
};
type EuropeanaResponse = { items?: EuropeanaItem[] };

async function search(q: string, key: string): Promise<CandidateItem[]> {
  const url =
    `https://api.europeana.eu/record/v2/search.json?wskey=${encodeURIComponent(key)}` +
    `&query=${encodeURIComponent(q)}&rows=${PER}&media=true&thumbnail=true` +
    `&qf=TYPE%3AIMAGE&reusability=open`;
  const json = await fetchJsonResilient<EuropeanaResponse>(url, {
    headers: { "User-Agent": "weaver-personal-aggregator/0.1 (discovery)", Accept: "application/json" },
  });
  const out: CandidateItem[] = [];
  for (const item of json?.items ?? []) {
    const img = item.edmPreview?.[0];
    if (!img) continue;
    out.push({
      imageUrl: img,
      sourceLink: item.guid || img,
      caption: (item.title?.[0] || "").slice(0, 300),
      source: "europeana",
    });
  }
  return out;
}

export const europeanaSource: CandidateSource = {
  name: "europeana",
  async pull(): Promise<CandidateItem[]> {
    const key = process.env.EUROPEANA_KEY;
    if (!key) return []; // no key → skip (keyless operation preserved)
    const seeds = await getTasteSeeds(8);
    const batches = await Promise.all(seeds.map((s) => search(s, key).catch(() => [] as CandidateItem[])));
    return batches.flat();
  },
};
