import "server-only";
import type { CandidateItem, CandidateSource } from "../types";

/**
 * Reddit discovery source via application-only OAuth (free).
 *
 * Reddit walled the unauthenticated `.json` endpoints (403 from servers), so we
 * authenticate app-only: POST client_credentials with the app's Basic auth to
 * get a bearer token, then read listings from oauth.reddit.com. Create a "web
 * app" at reddit.com/prefs/apps and set:
 *   REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET
 * Without them this source yields nothing (harmless — other sources still run).
 *
 * Image posts only; hotlinks the preview (i.redd.it / preview.redd.it).
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
const UA = "web:weaver-personal-aggregator:v0.2 (discovery)";

let cachedToken: { token: string; exp: number } | null = null;

async function getToken(now: number): Promise<string | null> {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (cachedToken && cachedToken.exp > now + 30_000) return cachedToken.token;

  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": UA,
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!j.access_token) return null;
  cachedToken = { token: j.access_token, exp: now + (j.expires_in ?? 3600) * 1000 };
  return j.access_token;
}

type RedditChild = {
  data: {
    title: string;
    permalink: string;
    over_18: boolean;
    is_video: boolean;
    is_gallery?: boolean;
    preview?: { images: { source: { url: string; width: number; height: number } }[] };
  };
};

function decode(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'");
}

async function pullSubreddit(sub: string, token: string): Promise<CandidateItem[]> {
  const res = await fetch(`https://oauth.reddit.com/r/${sub}/hot?limit=${PER_SUB}&raw_json=1`, {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": UA },
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
    const token = await getToken(Date.now());
    if (!token) return []; // creds unset or auth failed → yield nothing
    const batches = await Promise.all(
      SUBREDDITS.map((s) => pullSubreddit(s, token).catch(() => [] as CandidateItem[]))
    );
    return batches.flat();
  },
};
