/**
 * Weaver service worker (Phase 0 minimal).
 *
 * Scope today: app-shell offline fallback + cache-first for static assets, so
 * the PWA opens instantly and survives a flaky network. Push notifications and
 * runtime image caching are deliberately out of scope for Phase 0.
 *
 * NOTE: keep this lean. Heavy caching of hotlinked full-res images is avoided
 * on purpose (efficiency + the §5 thumbnail strategy already covers the feed).
 */

const CACHE = "weaver-shell-v1";
const SHELL = ["/"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // Only handle GET navigations/assets from our origin; never images/CDNs.
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) {
    return;
  }
  if (request.mode === "navigate") {
    // Network-first for pages so content stays fresh; fall back to cached shell.
    event.respondWith(
      fetch(request).catch(() => caches.match("/").then((r) => r ?? Response.error()))
    );
    return;
  }
  // Cache-first for same-origin static assets.
  event.respondWith(
    caches.match(request).then((cached) => cached ?? fetch(request))
  );
});
