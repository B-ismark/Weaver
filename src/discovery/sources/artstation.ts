import "server-only";
import type { CandidateItem, CandidateSource } from "../types";

/**
 * ArtStation discovery source (best-effort, no auth).
 *
 * ArtStation has no official public API; this uses the same unofficial JSON
 * endpoint the website's Explore page calls. ArtStation fronts its API with
 * Cloudflare and often blocks datacenter IPs, so this may return nothing in
 * production — by design it degrades to an empty batch rather than failing the
 * whole discovery run. Works locally / from residential IPs.
 *
 * Pulls trending project covers (illustration, concept art, 3D) as candidates.
 */
const PAGES = [1, 2];
const PER_PAGE = 30;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

type AsProject = {
  hash_id?: string;
  title?: string;
  permalink?: string;
  cover?: {
    medium_image_url?: string;
    thumb_url?: string;
    small_square_url?: string;
  };
};

async function pullPage(page: number): Promise<CandidateItem[]> {
  const url = `https://www.artstation.com/api/v2/community/explore/projects.json?page=${page}&per_page=${PER_PAGE}&dimension=all&sorting=trending`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json", Referer: "https://www.artstation.com/" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return []; // Cloudflare block / rate limit → empty
  const json = (await res.json().catch(() => null)) as { data?: AsProject[] } | null;
  if (!json?.data) return [];

  const out: CandidateItem[] = [];
  for (const p of json.data) {
    const img = p.cover?.medium_image_url || p.cover?.thumb_url;
    if (!img || !/\.(jpg|jpeg|png|webp)/i.test(img)) continue;
    const link = p.permalink || (p.hash_id ? `https://www.artstation.com/artwork/${p.hash_id}` : null);
    if (!link) continue;
    out.push({
      imageUrl: img,
      sourceLink: link,
      caption: (p.title || "").slice(0, 300),
      source: "artstation",
    });
  }
  return out;
}

export const artstationSource: CandidateSource = {
  name: "artstation",
  async pull(): Promise<CandidateItem[]> {
    const batches = await Promise.all(PAGES.map((p) => pullPage(p).catch(() => [] as CandidateItem[])));
    return batches.flat();
  },
};
