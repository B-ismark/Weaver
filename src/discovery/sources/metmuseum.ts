import "server-only";
import type { CandidateItem, CandidateSource } from "../types";
import { fetchJsonResilient } from "../fetch";

/**
 * Metropolitan Museum of Art discovery source (free, NO key, no IP wall).
 *
 * The Met's Open Access API: search returns objectIDs only, so this is an N+1 —
 * search per query, then fetch each object for its image. To stay within the
 * serverless budget we cap objects fetched per query (OBJECTS_PER_Q). Images are
 * served from images.metmuseum.org, which serves datacenter IPs fine.
 */
const QUERIES = ["landscape", "portrait", "still life", "abstract", "photography", "textile"];
const OBJECTS_PER_Q = 6; // bound the N+1 fan-out (queries × this = object fetches)
const UA = "weaver-personal-aggregator/0.1 (discovery)";

type MetSearch = { total?: number; objectIDs?: number[] | null };
type MetObject = {
  objectID?: number;
  title?: string;
  primaryImageSmall?: string;
  primaryImage?: string;
  objectURL?: string;
};

async function fetchObject(id: number): Promise<CandidateItem | null> {
  const o = await fetchJsonResilient<MetObject>(
    `https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`,
    { headers: { "User-Agent": UA, Accept: "application/json" } }
  );
  const img = o?.primaryImageSmall || o?.primaryImage;
  if (!img || !/\.(jpg|jpeg|png|webp)/i.test(img)) return null;
  return {
    imageUrl: img,
    sourceLink: o?.objectURL || `https://www.metmuseum.org/art/collection/search/${id}`,
    caption: (o?.title || "").slice(0, 300),
    source: "metmuseum",
    // dims omitted — the Space returns true dims when it embeds
  };
}

async function search(q: string): Promise<CandidateItem[]> {
  const s = await fetchJsonResilient<MetSearch>(
    `https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=${encodeURIComponent(q)}`,
    { headers: { "User-Agent": UA, Accept: "application/json" } }
  );
  const ids = (s?.objectIDs ?? []).slice(0, OBJECTS_PER_Q);
  const items = await Promise.all(ids.map((id) => fetchObject(id).catch(() => null)));
  return items.filter((x): x is CandidateItem => x !== null);
}

export const metmuseumSource: CandidateSource = {
  name: "metmuseum",
  async pull(): Promise<CandidateItem[]> {
    const batches = await Promise.all(QUERIES.map((q) => search(q).catch(() => [] as CandidateItem[])));
    return batches.flat();
  },
};
