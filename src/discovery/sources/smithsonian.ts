import "server-only";
import type { CandidateItem, CandidateSource } from "../types";
import { fetchJsonResilient } from "../fetch";
import { getTasteSeeds } from "../seeds";

/**
 * Smithsonian Open Access — millions of CC0 objects across 19 museums. Needs a
 * free api.data.gov key (instant), set as SMITHSONIAN_API_KEY. Unset → yields
 * nothing (keyless operation preserved); it's a bonus well, not a dependency.
 * Images served from ids.si.edu (datacenter-safe). Dims aren't in the response →
 * the Space fills them. Docs: https://edan.si.edu/openaccess/apidocs/
 */
const PER = 20;

type SiMedia = { type?: string; thumbnail?: string; content?: string };
type SiRow = {
  title?: string;
  content?: {
    descriptiveNonRepeating?: {
      record_link?: string;
      online_media?: { media?: SiMedia[] };
    };
  };
};
type SiResponse = { response?: { rows?: SiRow[] } };

async function search(q: string, key: string): Promise<CandidateItem[]> {
  // CC0-only + has-media filter keeps results usable and image-bearing.
  const query = `${q} AND online_media_type:"Images"`;
  const url =
    `https://api.si.edu/openaccess/api/v1.0/search?q=${encodeURIComponent(query)}` +
    `&rows=${PER}&api_key=${encodeURIComponent(key)}`;
  const json = await fetchJsonResilient<SiResponse>(url, {
    headers: { "User-Agent": "weaver-personal-aggregator/0.1 (discovery)", Accept: "application/json" },
  });
  const out: CandidateItem[] = [];
  for (const row of json?.response?.rows ?? []) {
    const dnr = row.content?.descriptiveNonRepeating;
    const media = dnr?.online_media?.media?.find((m) => m.type === "Images" && (m.content || m.thumbnail));
    const img = media?.content || media?.thumbnail;
    if (!img) continue;
    out.push({
      imageUrl: img,
      sourceLink: dnr?.record_link || img,
      caption: (row.title || "").slice(0, 300),
      source: "smithsonian",
    });
  }
  return out;
}

export const smithsonianSource: CandidateSource = {
  name: "smithsonian",
  async pull(): Promise<CandidateItem[]> {
    const key = process.env.SMITHSONIAN_API_KEY;
    if (!key) return []; // no key → skip (keyless operation preserved)
    const seeds = await getTasteSeeds(6);
    const batches = await Promise.all(seeds.map((s) => search(s, key).catch(() => [] as CandidateItem[])));
    return batches.flat();
  },
};
