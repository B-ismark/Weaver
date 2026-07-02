import "server-only";
import type { CandidateItem, CandidateSource } from "../types";
import { getTasteSeeds } from "../seeds";
import { fetchTextResilient } from "../fetch";
import { pullFeeds } from "./rss";

/**
 * Pinterest "similar accounts/boards" discovery source.
 *
 * Pinterest killed its public search API and its internal "related boards/users"
 * endpoints need login cookies + block datacenter IPs — so there's no token-free
 * way to ask Pinterest "who's like ArtStation_HQ?". We get the same outcome by
 * letting a general search engine do the "similar" part: query for
 * `<taste-seed> site:pinterest.com`, harvest the profile + board URLs it returns,
 * and turn each into the token-free RSS feed we already know how to ingest:
 *   profile → https://www.pinterest.com/<user>/feed.rss
 *   board   → https://www.pinterest.com/<user>/<board>.rss
 *
 * Search backend (paid search APIs like Brave/Bing all now gate or charge):
 *   1. Google Programmable Search JSON API — most reliable, free 100 queries/day
 *      (our runs use ~4). Set GOOGLE_CSE_KEY + GOOGLE_CSE_CX (both free, no card).
 *      Used when both are set. NB: Google Cloud org policies (work accounts) often
 *      deny bare API keys — if so, make the key on a personal account, or just
 *      rely on the keyless backends below.
 *   2. Keyless fallback (no setup, used when the Google vars are unset): Mojeek
 *      HTML first (returns direct result links, tolerant of scraping), then
 *      DuckDuckGo HTML (wraps links in `uddg=` redirects; throttles bursts into an
 *      "anomaly" page, so it's a best-effort last resort). Whichever returns
 *      results first wins per query.
 *
 * Seeds are DERIVED from the user's taste (see discovery/seeds.ts) so the wells
 * follow taste drift — the same seed-guided pull the arena/reddit sources use.
 * Feeds are pulled through the shared RSS parser (pullFeeds), which handles the
 * 236x→736x thumbnail upgrade.
 *
 * Pinterest RSS (and DDG) wall datacenter IPs, so run this LOCALLY
 * (`npm run discover -- pinterest-discover`) or set DISCOVERY_PROXY_URL so the
 * resilient fetch ladder can reach them from the cron. Kept out of the DEFAULT
 * sweep for that reason — invoke it by name.
 */
const SEEDS = 4; // taste seeds → one search query each
const MAX_FEEDS = 12; // cap fetches + embed cost per run
const RESULTS_PER_QUERY = 10;
const DDG_HTML = "https://html.duckduckgo.com/html/";
const MOJEEK = "https://www.mojeek.com/search";
const GOOGLE_CSE = "https://www.googleapis.com/customsearch/v1";
// DDG throttles bursts — space queries out to stay under its radar.
const QUERY_GAP_MS = 1500;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

// First path segment that is a Pinterest system route, not a user handle.
const RESERVED_USER = new Set([
  "pin", "pins", "search", "ideas", "idea", "categories", "category", "today",
  "news", "business", "login", "signup", "join", "settings", "about", "help",
  "discover", "topics", "topic", "videos", "all", "popular", "oembed.json",
  "terms", "privacy", "developers", "newsroom", "careers", "_", "resource",
]);
// Second path segment that is a profile sub-page, not a board.
const RESERVED_BOARD = new Set([
  "_saved", "_created", "followers", "following", "pins", "boards", "feed.rss",
  "activity", "more_ideas",
]);
const USER_RE = /^[A-Za-z0-9_]{3,60}$/;
const BOARD_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,80}$/;

/**
 * Turn a Pinterest URL into its RSS feed URL, or null if it isn't a profile/board
 * we can feed (pins, search pages, ideas hubs, etc. are skipped). Regional TLDs
 * (ca./uk.) are accepted but normalised onto www — the board content is global.
 */
function toFeedUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (!/(^|\.)pinterest\.[a-z.]+$/i.test(u.hostname)) return null;
  const segs = u.pathname.split("/").filter(Boolean).map((s) => s.toLowerCase());
  if (!segs.length) return null;

  const user = segs[0];
  if (RESERVED_USER.has(user) || !USER_RE.test(user)) return null;

  // /<user>            → whole-profile feed
  if (segs.length === 1) return `https://www.pinterest.com/${user}/feed.rss`;

  // /<user>/<board>    → board feed
  if (segs.length === 2) {
    const board = segs[1].replace(/\.rss$/, "");
    if (RESERVED_BOARD.has(segs[1]) || !BOARD_RE.test(board)) return null;
    return `https://www.pinterest.com/${user}/${board}.rss`;
  }

  // deeper (/<user>/<board>/<pin>, section pages, …) → not a clean feed
  return null;
}

/** Feed URLs already configured statically — don't rediscover our own wells. */
function configuredFeeds(): Set<string> {
  return new Set(
    (process.env.RSS_FEEDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

/** Google Programmable Search JSON API — reliable, free 100 queries/day. */
async function googleSearch(query: string, key: string, cx: string): Promise<string[]> {
  const u = new URL(GOOGLE_CSE);
  u.searchParams.set("key", key);
  u.searchParams.set("cx", cx);
  u.searchParams.set("q", query);
  u.searchParams.set("num", String(RESULTS_PER_QUERY));
  // Real API, not IP-walled → plain fetch (the Jina fallback would strip auth).
  const res = await fetch(u, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!res || !res.ok) return []; // bad creds / quota / network → skip this query
  const json = (await res.json().catch(() => null)) as { items?: { link?: string }[] } | null;
  return (json?.items ?? []).map((i) => i.link ?? "").filter(Boolean);
}

/**
 * Mojeek HTML — keyless, tolerant of scraping, and (unlike DDG) links to results
 * directly, so we just pull every pinterest.com URL out of the page and let
 * toFeedUrl sort profiles/boards from `/ideas/` hubs and `/pin/` pages.
 */
async function mojeekSearch(query: string): Promise<string[]> {
  const html = await fetchTextResilient(`${MOJEEK}?q=${encodeURIComponent(query)}`, {
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
  });
  if (!html) return [];
  return html.match(/https?:\/\/(?:[a-z]{1,3}\.)?pinterest\.com\/[A-Za-z0-9_\-/]+/gi) ?? [];
}

/**
 * DuckDuckGo HTML fallback. Results are wrapped in
 * `//duckduckgo.com/l/?uddg=<encoded>&rut=…`; we pull each `uddg=` value and
 * decode it. On a throttle/challenge the page carries no results, so we return
 * [] — best-effort by design.
 */
async function ddgSearch(query: string): Promise<string[]> {
  const html = await fetchTextResilient(`${DDG_HTML}?q=${encodeURIComponent(query)}`, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!html) return [];
  const out: string[] = [];
  const re = /uddg=([^"&]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      out.push(decodeURIComponent(m[1]));
    } catch {
      // malformed escape → skip this result
    }
  }
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const pinterestDiscoverSource: CandidateSource = {
  name: "pinterest-discover",
  async pull(): Promise<CandidateItem[]> {
    const gKey = process.env.GOOGLE_CSE_KEY;
    const gCx = process.env.GOOGLE_CSE_CX;
    const useGoogle = !!(gKey && gCx);
    // Keyless path: Mojeek first (reliable, direct links), DDG only if it's dry.
    const freeSearch = async (q: string): Promise<string[]> => {
      const m = await mojeekSearch(q).catch(() => []);
      return m.length ? m : ddgSearch(q).catch(() => []);
    };
    const search = (q: string): Promise<string[]> =>
      useGoogle ? googleSearch(q, gKey!, gCx!) : freeSearch(q);

    const seeds = await getTasteSeeds(SEEDS);
    const already = configuredFeeds();
    const feeds = new Set<string>();

    // Sequential (DDG throttles bursts; Google's fine either way) with a gap.
    for (let i = 0; i < seeds.length; i++) {
      if (i > 0) await sleep(QUERY_GAP_MS);
      const urls = await search(`${seeds[i]} site:pinterest.com`).catch(() => []);
      for (const raw of urls) {
        const feed = toFeedUrl(raw);
        if (feed && !already.has(feed)) feeds.add(feed);
        if (feeds.size >= MAX_FEEDS) break;
      }
      if (feeds.size >= MAX_FEEDS) break;
    }

    // Stored as platform "rss" (what they are — Pinterest RSS feeds), matching the
    // rss source; the DiscoveryReport still tags the run "pinterest-discover" via
    // source.name. ("pinterest-discover" isn't in the items_platform_check enum.)
    return pullFeeds([...feeds], "rss");
  },
};
