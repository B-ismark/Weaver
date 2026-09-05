import "server-only";

/**
 * Shared egress-proxy dispatcher bootstrap, used by both discovery's resilient
 * text/JSON fetch (src/discovery/fetch.ts) and the image cache (src/lib/imageCache.ts)
 * to route around hosts that wall datacenter IPs (e.g. ArtStation, Reddit).
 * Lazily builds one undici ProxyAgent and reuses it (connection pooling); imported
 * dynamically so callers still load fine when no proxy is configured.
 */
let proxyDispatcherPromise: Promise<unknown> | null = null;

export async function getProxyDispatcher(): Promise<unknown> {
  const proxy = process.env.DISCOVERY_PROXY_URL || "";
  if (!proxy) return null;
  if (!proxyDispatcherPromise) {
    proxyDispatcherPromise = import("undici")
      .then(({ ProxyAgent }) => new ProxyAgent(proxy))
      .catch(() => null); // undici missing → skip proxy leg gracefully
  }
  return proxyDispatcherPromise;
}
