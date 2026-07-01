import "server-only";
import type { CandidateItem, CandidateSource } from "../types";

/**
 * Openverse discovery source (free, no auth). CC-licensed images — safe to
 * redistribute/cache if we ever want to (discovery spec §13). Keyword search,
 * with dims provided. Query terms echo the user's boards; seed-guided later.
 */
const QUERIES = [
  "minimalist photography",
  "architecture",
  "fine art",
  "film still",
  "landscape photography",
  "graphic design poster",
  "street photography",
  "abstract painting",
  "portrait",
  "interior design",
  "nature macro",
  "typography",
  "vintage illustration",
  "urban landscape",
  "textile pattern",
  "still life photography",
];
const PER = 20;

type OvResult = {
  url: string;
  foreign_landing_url: string;
  title: string;
  width?: number;
  height?: number;
};

async function search(q: string): Promise<CandidateItem[]> {
  const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=${PER}&mature=false`;
  const res = await fetch(url, {
    headers: { "User-Agent": "weaver-personal-aggregator/0.1" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { results?: OvResult[] };
  return (json.results ?? [])
    .filter((r) => r.url && /\.(jpg|jpeg|png|webp)/i.test(r.url))
    .map((r) => ({
      imageUrl: r.url,
      sourceLink: r.foreign_landing_url,
      caption: (r.title || "").slice(0, 300),
      source: "openverse",
      width: r.width,
      height: r.height,
    }));
}

export const openverseSource: CandidateSource = {
  name: "openverse",
  async pull(): Promise<CandidateItem[]> {
    const batches = await Promise.all(QUERIES.map((q) => search(q).catch(() => [] as CandidateItem[])));
    return batches.flat();
  },
};
