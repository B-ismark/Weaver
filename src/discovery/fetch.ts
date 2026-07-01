import "server-only";

/**
 * Escalating fetch for discovery sources (Agent-Reach idea, portable to Vercel).
 *
 * Some sources front their API with Cloudflare and block datacenter IPs (e.g.
 * ArtStation), so a plain fetch from a serverless function gets 403/503. This
 * helper walks an escalation ladder, stopping at the first strategy that returns
 * a usable body:
 *
 *   1. DIRECT   — normal fetch (works for most sources / residential dev IPs).
 *   2. PROXY    — retry through an egress proxy if DISCOVERY_PROXY_URL is set.
 *                 Point this at a residential/rotating proxy to beat IP walls
 *                 without moving ingestion off Vercel. (undici ProxyAgent.)
 *   3. JINA     — last resort: fetch via the r.jina.ai reader, which requests the
 *                 URL from Jina's own infra and returns the raw body. No key
 *                 needed for the free tier; set JINA_API_KEY for a higher limit.
 *                 NOTE: some hosts (e.g. Reddit) also block Jina's IPs, so this
 *                 leg only rescues sources that wall datacenter IPs but not Jina.
 *                 For hard walls (Reddit, ArtStation) set DISCOVERY_PROXY_URL to
 *                 a residential proxy — that's the only reliable unblocker.
 *
 * Every strategy degrades to null on failure so a blocked source yields an empty
 * batch rather than crashing the whole discovery run.
 */

const PROXY = process.env.DISCOVERY_PROXY_URL || "";
// Jina front is on by default (no key required); set DISCOVERY_USE_JINA=0 to disable.
const JINA_ENABLED = process.env.DISCOVERY_USE_JINA !== "0";
const JINA_KEY = process.env.JINA_API_KEY || "";

const DEFAULT_TIMEOUT = 20_000;

export interface DiscoveryFetchOpts {
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** Allow the r.jina.ai reader fallback for this call (default true). */
  viaJina?: boolean;
}

// Lazily build one ProxyAgent and reuse it (connection pooling). Imported
// dynamically so the module still loads when no proxy is configured.
let proxyDispatcherPromise: Promise<unknown> | null = null;
async function getProxyDispatcher(): Promise<unknown> {
  if (!PROXY) return null;
  if (!proxyDispatcherPromise) {
    proxyDispatcherPromise = import("undici")
      .then(({ ProxyAgent }) => new ProxyAgent(PROXY))
      .catch(() => null); // undici missing → skip proxy leg gracefully
  }
  return proxyDispatcherPromise;
}

function isBlocked(status: number): boolean {
  // Cloudflare / rate-limit / auth walls we can try to route around.
  return status === 401 || status === 403 || status === 429 || status === 503;
}

async function tryDirect(url: string, opts: DiscoveryFetchOpts): Promise<string | null> {
  const res = await fetch(url, {
    headers: opts.headers,
    signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT),
  }).catch(() => null);
  if (!res) return null;
  if (isBlocked(res.status) || !res.ok) return null;
  return res.text().catch(() => null);
}

async function tryProxy(url: string, opts: DiscoveryFetchOpts): Promise<string | null> {
  const dispatcher = await getProxyDispatcher();
  if (!dispatcher) return null;
  // `dispatcher` is an undici-only RequestInit extension; Node's global fetch honors it.
  const res = await fetch(url, {
    headers: opts.headers,
    signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT),
    // @ts-expect-error dispatcher is a Node/undici extension not in the DOM types
    dispatcher,
  }).catch(() => null);
  if (!res) return null;
  if (isBlocked(res.status) || !res.ok) return null;
  return res.text().catch(() => null);
}

async function tryJina(url: string, opts: DiscoveryFetchOpts): Promise<string | null> {
  if (!JINA_ENABLED || opts.viaJina === false) return null;
  // With Accept: application/json the reader wraps the fetched page in its own
  // envelope: { code, status, data: { content|text, url, ... } }. We ask for the
  // raw fetched body (X-Return-Format: text) and then unwrap data.content/text.
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Return-Format": "text",
  };
  if (JINA_KEY) headers.Authorization = `Bearer ${JINA_KEY}`;
  const res = await fetch(`https://r.jina.ai/${url}`, {
    headers,
    signal: AbortSignal.timeout(Math.max(opts.timeoutMs ?? DEFAULT_TIMEOUT, 30_000)),
  }).catch(() => null);
  if (!res || !res.ok) return null;
  const raw = await res.text().catch(() => null);
  if (!raw) return null;
  try {
    const env = JSON.parse(raw) as { data?: { content?: string; text?: string } };
    // Unwrap the envelope to the true target body when present; else fall back to raw.
    return env?.data?.content ?? env?.data?.text ?? raw;
  } catch {
    return raw; // not an envelope (reader returned the body directly) → use as-is
  }
}

/** Fetch a URL's body as text, escalating through proxy + jina on blocks. */
export async function fetchTextResilient(
  url: string,
  opts: DiscoveryFetchOpts = {}
): Promise<string | null> {
  return (
    (await tryDirect(url, opts)) ??
    (await tryProxy(url, opts)) ??
    (await tryJina(url, opts))
  );
}

/** Fetch + JSON.parse a URL, escalating on blocks. Returns null on any failure. */
export async function fetchJsonResilient<T = unknown>(
  url: string,
  opts: DiscoveryFetchOpts = {}
): Promise<T | null> {
  const text = await fetchTextResilient(url, opts);
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null; // reader returned HTML/garbage instead of JSON → treat as blocked
  }
}
