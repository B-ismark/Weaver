import "server-only";
import type { CandidateItem, CandidateSource } from "../types";
import { fetchJsonResilient } from "../fetch";

/**
 * ArtStation discovery source (best-effort, no auth).
 *
 * ArtStation has no official public API; this uses an unofficial JSON endpoint.
 * The old community/explore/projects.json endpoint now 500s for everyone (dead),
 * so we hit search/projects.json instead — the one endpoint still returning data.
 * ArtStation fronts its API with Cloudflare and often blocks datacenter IPs, so a
 * direct fetch from Vercel usually 403s; we route through fetchJsonResilient,
 * which escalates direct → proxy (DISCOVERY_PROXY_URL) → r.jina.ai reader to beat
 * the IP wall. It degrades to an empty batch if every leg fails, so a block never
 * fails the whole discovery run.
 *
 * Pulls project covers (illustration, concept art, 3D) as candidates.
 */
const PAGES = [1, 2];
const PER_PAGE = 30;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// search/projects.json returns a flat shape (cover urls are top-level, not nested
// under `cover`). Prefer the largest cover; fall back down to the square thumb.
type AsProject = {
  hash_id?: string;
  title?: string;
  url?: string; // absolute artwork permalink
  permalink?: string;
  cover_url?: string;
  medium_cover_url?: string;
  smaller_square_cover_url?: string;
  hide_as_adult?: boolean;
  is_adult_content?: boolean;
  icons?: { image?: boolean; video?: boolean };
};

// search/projects.json only exposes the square crop (smaller_square_cover_url).
// ArtStation cover URLs embed the size as a path segment, so swap the square
// variant for `medium` to get the uncropped, higher-res image (real aspect ratio
// → the Space reads true dims, no layout shift). Falls through unchanged if the
// pattern isn't present; a bad guess just fails to embed and is dropped.
function upgradeCover(url: string): string {
  return url.replace(/\/(micro_square|smaller_square|small_square)\//, "/medium/");
}

async function pullPage(page: number): Promise<CandidateItem[]> {
  const url = `https://www.artstation.com/api/v2/search/projects.json?page=${page}&per_page=${PER_PAGE}`;
  const json = await fetchJsonResilient<{ data?: AsProject[] }>(url, {
    headers: { "User-Agent": UA, Accept: "application/json", Referer: "https://www.artstation.com/" },
  });
  if (!json?.data) return []; // every leg blocked / empty → degrade to empty batch

  const out: CandidateItem[] = [];
  for (const p of json.data) {
    if (p.is_adult_content || p.hide_as_adult) continue; // images-only, SFW (§3)
    if (p.icons && p.icons.image === false) continue; // skip video/3d-only projects
    const raw = p.cover_url || p.medium_cover_url || p.smaller_square_cover_url;
    if (!raw || !/\.(jpg|jpeg|png|webp)/i.test(raw)) continue;
    const img = upgradeCover(raw);
    const link = p.url || p.permalink || (p.hash_id ? `https://www.artstation.com/artwork/${p.hash_id}` : null);
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
