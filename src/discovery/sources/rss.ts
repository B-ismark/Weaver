import "server-only";
import type { CandidateItem, CandidateSource } from "../types";
import { fetchTextResilient } from "../fetch";

/**
 * Generic RSS / Atom image source — the walls the platforms forgot to close.
 *
 * Many platforms still expose token-free RSS even after walling their JSON APIs:
 *   - Pinterest boards:  https://www.pinterest.com/<user>/<board>.rss
 *   - Reddit subreddits: https://www.reddit.com/r/<sub>/.rss
 *   - Tumblr, Behance, blogs, gallery software, etc.
 *
 * Configure feeds via the RSS_FEEDS env var (comma-separated URLs). Unset → the
 * source yields nothing (opt-in; no default feeds that might not match taste).
 * Routed through the resilient fetch ladder so hosts that block datacenter IPs
 * (Reddit, Pinterest) can still be reached via a proxy/reader when configured;
 * otherwise the feed just degrades to empty. The local ingest daemon can run the
 * same feeds from a residential IP with no proxy needed.
 *
 * Dependency-free parser (no XML lib): we pull <item>/<entry> blocks and extract
 * an image URL from the media tags first, then any <img> in the HTML body.
 */
const PER_FEED = 25;
const IMG_EXT = /\.(jpg|jpeg|png|webp|gif)(\?|$)/i;

function feeds(): string[] {
  return (process.env.RSS_FEEDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Decode the handful of XML/HTML entities that show up in URLs + titles. */
function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&#x2F;/gi, "/");
}

/** Strip CDATA wrappers + tags, collapse whitespace (for titles). */
function stripTags(s: string): string {
  return decode(s.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function firstAttr(block: string, tag: string, attr: string): string | null {
  // e.g. <media:content url="..."> / <media:thumbnail url="..."> / <enclosure url="...">
  const re = new RegExp(`<${tag}\\b[^>]*\\b${attr}\\s*=\\s*["']([^"']+)["']`, "i");
  const m = re.exec(block);
  return m ? decode(m[1]) : null;
}

function extractImage(block: string): string | null {
  // Prefer explicit media tags, then enclosure, then the first <img> in the body.
  const media =
    firstAttr(block, "media:content", "url") ||
    firstAttr(block, "media:thumbnail", "url") ||
    firstAttr(block, "enclosure", "url");
  if (media && /^https?:\/\//i.test(media)) return media;

  // <img src="..."> inside description/content (often CDATA-wrapped HTML).
  const img = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i.exec(block);
  if (img) {
    const url = decode(img[1]);
    if (/^https?:\/\//i.test(url)) return url;
  }
  return null;
}

function extractBetween(block: string, tag: string): string | null {
  const m = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(block);
  return m ? m[1] : null;
}

function extractLink(block: string): string | null {
  // Atom: <link href="..."/>  RSS: <link>...</link>
  const href = firstAttr(block, "link", "href");
  if (href) return href;
  const inner = extractBetween(block, "link");
  return inner ? stripTags(inner) : null;
}

function parseFeed(xml: string): CandidateItem[] {
  const out: CandidateItem[] = [];
  // Match both RSS <item> and Atom <entry>.
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/(item|entry)>/gi) ?? [];
  for (const block of blocks.slice(0, PER_FEED)) {
    const image = extractImage(block);
    if (!image) continue;
    // Keep obvious raster images; media tags without an extension are trusted.
    if (!IMG_EXT.test(image) && !/<media:(content|thumbnail)\b/i.test(block)) continue;
    const titleRaw = extractBetween(block, "title");
    const link = extractLink(block);
    out.push({
      imageUrl: image,
      sourceLink: link || image,
      caption: (titleRaw ? stripTags(titleRaw) : "").slice(0, 300),
      source: "rss",
    });
  }
  return out;
}

async function pullFeed(url: string): Promise<CandidateItem[]> {
  const xml = await fetchTextResilient(url, {
    headers: {
      "User-Agent": "weaver-personal-aggregator/0.1 (+rss)",
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
    },
  });
  if (!xml) return [];
  return parseFeed(xml);
}

export const rssSource: CandidateSource = {
  name: "rss",
  async pull(): Promise<CandidateItem[]> {
    const urls = feeds();
    if (!urls.length) return []; // no feeds configured → skip
    const batches = await Promise.all(urls.map((u) => pullFeed(u).catch(() => [] as CandidateItem[])));
    return batches.flat();
  },
};
