import "server-only";
import type { CandidateItem, CandidateSource } from "../types";

/**
 * Reddit discovery source (free, no auth). Pulls image posts from a set of
 * visually-oriented subreddits via the public `.json` endpoints.
 *
 * Subreddits chosen to echo the user's Pinterest boards (Photography, Art,
 * Architecture). Seed-guided selection (§5.2) can replace this fixed list later.
 *
 * Respects Reddit etiquette: descriptive User-Agent, modest limits. Hotlinks
 * the preview image (i.redd.it / preview.redd.it) — candidates aren't cached.
 */
const SUBREDDITS = [
  "photographs",
  "itookapicture",
  "Art",
  "ArchitecturePorn",
  "design",
  "DesignPorn",
  "minimalism",
  "CozyPlaces",
];
const PER_SUB = 25;
const UA = "web:weaver-personal-aggregator:v0.1 (by /u/weaver)";

type RedditChild = {
  data: {
    title: string;
    permalink: string;
    over_18: boolean;
    is_video: boolean;
    is_gallery?: boolean;
    post_hint?: string;
    url_overridden_by_dest?: string;
    preview?: {
      images: { source: { url: string; width: number; height: number } }[];
    };
  };
};

function decode(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'");
}

async function pullSubreddit(sub: string): Promise<CandidateItem[]> {
  const res = await fetch(`https://www.reddit.com/r/${sub}/hot.json?limit=${PER_SUB}`, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { data?: { children?: RedditChild[] } };
  const out: CandidateItem[] = [];

  for (const { data: p } of json.data?.children ?? []) {
    if (p.over_18 || p.is_video || p.is_gallery) continue; // images only (§3)
    const preview = p.preview?.images?.[0]?.source;
    if (!preview) continue;
    const url = decode(preview.url);
    // Only real raster images.
    if (!/\.(jpg|jpeg|png|webp)/i.test(url)) continue;

    out.push({
      imageUrl: url,
      sourceLink: `https://www.reddit.com${p.permalink}`,
      caption: p.title?.slice(0, 300) ?? "",
      source: "reddit",
      width: preview.width,
      height: preview.height,
    });
  }
  return out;
}

export const redditSource: CandidateSource = {
  name: "reddit",
  async pull(): Promise<CandidateItem[]> {
    const batches = await Promise.all(
      SUBREDDITS.map((s) => pullSubreddit(s).catch(() => [] as CandidateItem[]))
    );
    return batches.flat();
  },
};
