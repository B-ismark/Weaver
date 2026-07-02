import "server-only";
import type { CandidateItem, CandidateSource } from "../types";
import { getTasteSeeds } from "../seeds";
import { fetchTextResilient } from "../fetch";
import { pullFeeds } from "./rss";

/**
 * "Similar accounts/boards/blogs" discovery source (Pinterest + Tumblr).
 *
 * Neither platform offers a token-free "related accounts" endpoint (Pinterest's
 * needs login cookies + blocks datacenter IPs; Tumblr's is gated). We get the
 * same outcome by letting a general search engine do the "similar" part: query
 * `<taste-seed> site:<platform>`, harvest the profile/board/blog URLs it returns,
 * and turn each into the token-free RSS feed we already ingest:
 *   pinterest profile → https://www.pinterest.com/<user>/feed.rss
 *   pinterest board   → https://www.pinterest.com/<user>/<board>.rss
 *   tumblr blog       → https://<blog>.tumblr.com/rss
 *
 * Search backend (paid search APIs like Brave/Bing all now gate or charge):
 *   1. Google Programmable Search JSON API — most reliable, free 100 queries/day.
 *      Set GOOGLE_CSE_KEY + GOOGLE_CSE_CX (free, no card). NB: Google Cloud org
 *      policies (work accounts) often deny bare API keys — if so, make the key on
 *      a personal account, or rely on the keyless backends below. Also: a CSE
 *      restricted to one site won't return the others; use an "entire web" engine.
 *   2. Keyless fallback (default, when the Google vars are unset): Mojeek HTML
 *      first (direct result links, tolerant of scraping), then DuckDuckGo HTML
 *      (best-effort; throttles bursts into an "anomaly" page). First non-empty wins.
 *
 * Seeds are DERIVED from the user's taste (see discovery/seeds.ts) so the wells
 * follow taste drift. Feeds run through the shared RSS parser (pullFeeds), which
 * also does the Pinterest 236x→736x thumbnail upgrade (no-op for Tumblr).
 *
 * Pinterest/Mojeek/DDG wall datacenter IPs, so run LOCALLY
 * (`npm run discover -- pinterest-discover`) or set DISCOVERY_PROXY_URL so the
 * resilient fetch ladder can reach them from the cron. Kept out of the DEFAULT
 * sweep for that reason — invoke it by name.
 */
const SEEDS = 4; // taste seeds → one query per platform each
const PLATFORMS = ["pinterest.com", "tumblr.com"]; // site: filters, interleaved
const MAX_FEEDS = 14; // cap fetches + embed cost per run (across platforms)
const RESULTS_PER_QUERY = 10;
const DDG_HTML = "https://html.duckduckgo.com/html/";
const MOJEEK = "https://www.mojeek.com/search";
const GOOGLE_CSE = "https://www.googleapis.com/customsearch/v1";
// DDG/Mojeek throttle bursts — space queries out to stay under their radar.
const QUERY_GAP_MS = 1500;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

// --- Pinterest URL → feed --------------------------------------------------
// First path segment that is a Pinterest system route, not a user handle.
const PIN_RESERVED_USER = new Set([
  "pin", "pins", "search", "ideas", "idea", "categories", "category", "today",
  "news", "business", "login", "signup", "join", "settings", "about", "help",
  "discover", "topics", "topic", "videos", "all", "popular", "oembed.json",
  "terms", "privacy", "developers", "newsroom", "careers", "_", "resource",
]);
// Second path segment that is a profile sub-page, not a board.
const PIN_RESERVED_BOARD = new Set([
  "_saved", "_created", "followers", "following", "pins", "boards", "feed.rss",
  "activity", "more_ideas",
]);
const PIN_USER_RE = /^[A-Za-z0-9_]{3,60}$/;
const PIN_BOARD_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,80}$/;

function toPinterestFeed(u: URL): string | null {
  const segs = u.pathname.split("/").filter(Boolean).map((s) => s.toLowerCase());
  if (!segs.length) return null;
  const user = segs[0];
  if (PIN_RESERVED_USER.has(user) || !PIN_USER_RE.test(user)) return null;
  // /<user> → whole-profile feed
  if (segs.length === 1) return `https://www.pinterest.com/${user}/feed.rss`;
  // /<user>/<board> → board feed
  if (segs.length === 2) {
    const board = segs[1].replace(/\.rss$/, "");
    if (PIN_RESERVED_BOARD.has(segs[1]) || !PIN_BOARD_RE.test(board)) return null;
    return `https://www.pinterest.com/${user}/${board}.rss`;
  }
  return null; // deeper (pins, sections) → not a clean feed
}

// --- Tumblr URL → feed -----------------------------------------------------
// Subdomains / path heads that are Tumblr infra, not a blog name.
const TUMBLR_RESERVED = new Set([
  "www", "assets", "static", "media", "secure", "safe", "embed", "srvcs", "api",
  "of", "at", "help", "64", "66", "va",
  // new-scheme (www.tumblr.com/<x>) app routes:
  "dashboard", "explore", "search", "settings", "likes", "following", "blog",
  "tagged", "register", "login", "about", "apps", "policy", "privacy", "tips",
  "press", "inbox", "new", "reblog",
]);
const TUMBLR_BLOG_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;

function toTumblrFeed(u: URL): string | null {
  const host = u.hostname.toLowerCase();
  let blog: string | undefined;
  if (host !== "tumblr.com" && host !== "www.tumblr.com") {
    // <blog>.tumblr.com → subdomain is the blog
    blog = host.split(".")[0];
  } else {
    // www.tumblr.com/<blog> or /blog/view/<blog> (new URL scheme)
    const segs = u.pathname.split("/").filter(Boolean).map((s) => s.toLowerCase());
    blog = segs[0] === "blog" ? segs[2] ?? segs[1] : segs[0];
  }
  if (!blog || TUMBLR_RESERVED.has(blog) || !TUMBLR_BLOG_RE.test(blog)) return null;
  return `https://${blog}.tumblr.com/rss`;
}

/** Dispatch a search-result URL to the right platform feed builder, or null. */
function toFeedUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  if (/(^|\.)pinterest\.[a-z.]+$/.test(host)) return toPinterestFeed(u);
  if (/(^|\.)tumblr\.com$/.test(host)) return toTumblrFeed(u);
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
 * Mojeek HTML — keyless, tolerant of scraping, links to results directly. We pull
 * every absolute URL off the page and let toFeedUrl keep only the platform
 * profile/board/blog links (Mojeek's own nav, image CDNs, pins, etc. drop out).
 */
async function mojeekSearch(query: string): Promise<string[]> {
  const html = await fetchTextResilient(`${MOJEEK}?q=${encodeURIComponent(query)}`, {
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
  });
  if (!html) return [];
  return html.match(/https?:\/\/[^\s"'<>()]+/gi) ?? [];
}

/**
 * DuckDuckGo HTML fallback. Results are wrapped in
 * `//duckduckgo.com/l/?uddg=<encoded>&rut=…`; we pull each `uddg=` value and
 * decode it. On a throttle/challenge the page carries no results → [].
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

    // seed × platform, sequential with a gap (search hosts throttle bursts).
    let gapPending = false;
    outer: for (const seed of seeds) {
      for (const dom of PLATFORMS) {
        if (gapPending) await sleep(QUERY_GAP_MS);
        gapPending = true;
        const urls = await search(`${seed} site:${dom}`).catch(() => []);
        for (const raw of urls) {
          const feed = toFeedUrl(raw);
          if (feed && !already.has(feed)) feeds.add(feed);
          if (feeds.size >= MAX_FEEDS) break outer;
        }
      }
    }

    // Stored as platform "rss" (what they are — Pinterest/Tumblr RSS feeds),
    // matching the rss source; the DiscoveryReport still tags the run
    // "pinterest-discover" via source.name. (Neither "pinterest-discover" nor a
    // per-platform label beyond "rss" is in the items_platform_check enum.)
    return pullFeeds([...feeds], "rss");
  },
};
