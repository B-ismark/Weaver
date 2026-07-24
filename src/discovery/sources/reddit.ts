import "server-only";
import type { CandidateItem, CandidateSource } from "../types";
import { fetchTextResilient } from "../fetch";

/**
 * Reddit discovery source. Two paths, chosen at runtime:
 *
 *  1. AUTHED (preferred) — application-only OAuth. Create a "web app" at
 *     reddit.com/prefs/apps and set REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET.
 *     Reads listings from oauth.reddit.com (reliable from any IP, full-res
 *     preview images, NSFW flag honored).
 *
 *  2. KEYLESS FALLBACK — when no creds are set. Reddit walled the unauthenticated
 *     `.json` endpoints (403 with a block page), but the per-subreddit Atom feed
 *     (/r/<sub>/.rss) still serves. Each entry embeds a preview <img> plus a
 *     "[link]" anchor to the full-resolution i.redd.it original — we prefer the
 *     latter. Routed through the resilient fetch ladder, so it works from a
 *     residential dev IP now and can be unblocked in CI via DISCOVERY_PROXY_URL.
 *     (Add real OAuth creds later and the source silently upgrades to path 1.)
 *
 * Image posts only; a total failure just yields an empty batch (other sources run).
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
  // Concept art — ImaginaryNetwork + dedicated subs. The best free concept-art
  // wells on Reddit: film/game keyframes, environment + character design, illos.
  "ImaginaryLandscapes",
  "ImaginaryCharacters",
  "ImaginaryArchitecture",
  "ImaginaryTechnology",
  "conceptart",
  "SpecArt",
];
const PER_SUB = 25;
const UA = "web:weaver-personal-aggregator:v0.2 (discovery)";
// Reddit's Atom feed 403s the bot UA but serves a browser one.
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

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

// ── Authed path (oauth.reddit.com) ──────────────────────────────────────────

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

type Listing = { data?: { children?: RedditChild[] } };

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (m, d) => {
      const n = parseInt(d, 10);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    });
}

async function pullSubredditAuthed(sub: string, token: string): Promise<CandidateItem[]> {
  const res = await fetch(`https://oauth.reddit.com/r/${sub}/hot?limit=${PER_SUB}&raw_json=1`, {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": UA },
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  if (!res?.ok) return [];
  const json = (await res.json().catch(() => null)) as Listing | null;
  if (!json) return [];

  const out: CandidateItem[] = [];
  for (const { data: p } of json.data?.children ?? []) {
    if (p.over_18 || p.is_video || p.is_gallery) continue; // images only
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

// ── Keyless path (/r/<sub>/.rss) ─────────────────────────────────────────────

const IREDDIT = /href="(https:\/\/i\.redd\.it\/[^"]+\.(?:jpe?g|png|webp))"/i;
const PREVIEW_IMG = /<img\b[^>]*\bsrc="(https:\/\/preview\.redd\.it\/[^"]+)"/i;

async function pullSubredditRss(sub: string): Promise<CandidateItem[]> {
  const xml = await fetchTextResilient(`https://www.reddit.com/r/${sub}/hot/.rss?limit=${PER_SUB}`, {
    headers: {
      "User-Agent": BROWSER_UA,
      Accept: "application/atom+xml, application/xml, text/xml, */*",
    },
  });
  if (!xml) return [];

  const out: CandidateItem[] = [];
  for (const entry of xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? []) {
    // The <content> HTML is entity-encoded; decode so hrefs/imgs are matchable.
    const html = decode(entry);
    // Prefer the full-resolution original over the cropped preview thumbnail.
    const url = IREDDIT.exec(html)?.[1] ?? PREVIEW_IMG.exec(html)?.[1];
    if (!url) continue; // no image (self/text/external post) → skip
    const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(entry)?.[1] ?? "";
    const link = /<link\b[^>]*\bhref="([^"]+)"/i.exec(entry)?.[1];
    out.push({
      imageUrl: url,
      sourceLink: link ?? url,
      caption: decode(title.replace(/<!\[CDATA\[|\]\]>/g, "")).trim().slice(0, 300),
      source: "reddit",
    });
  }
  return out;
}

export const redditSource: CandidateSource = {
  name: "reddit",
  async pull(): Promise<CandidateItem[]> {
    const token = await getToken(Date.now());
    // Authed when creds are present, keyless Atom fallback otherwise.
    const pullOne = token
      ? (s: string) => pullSubredditAuthed(s, token)
      : (s: string) => pullSubredditRss(s);
    const batches = await Promise.all(
      SUBREDDITS.map((s) => pullOne(s).catch(() => [] as CandidateItem[]))
    );
    return batches.flat();
  },
};
