"use client";

/**
 * Batches feed-tile impressions and flushes them to /api/impression, so the feed
 * can exclude content you've already seen (migration 0016). A tile is recorded
 * once per session; ids are debounced into one request, and flushed on page hide
 * via sendBeacon so they survive navigation away.
 */
const pending = new Set<string>();
const sent = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (pending.size === 0) return;
  const ids = [...pending];
  pending.clear();
  ids.forEach((id) => sent.add(id));

  const body = JSON.stringify({ ids });
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/impression", new Blob([body], { type: "application/json" }));
      return;
    }
  } catch {
    // fall through to fetch
  }
  fetch("/api/impression", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

export function recordImpression(id: string) {
  if (sent.has(id) || pending.has(id)) return;
  pending.add(id);
  if (!timer) timer = setTimeout(flush, 1500);
}

/**
 * One shared IntersectionObserver for the whole feed, instead of one per tile.
 * A long infinite feed can hold hundreds of tiles; a per-tile observer meant
 * hundreds of observers churning during scroll. This registers an element→id,
 * records the impression the first time it's ≥50% visible, then stops watching
 * it. Elements are keyed weakly so unmounted tiles don't leak.
 */
let io: IntersectionObserver | null = null;
const idFor = new WeakMap<Element, string>();

function observer(): IntersectionObserver | null {
  if (io || typeof window === "undefined") return io;
  io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const id = idFor.get(e.target);
        if (id) recordImpression(id);
        io?.unobserve(e.target);
        idFor.delete(e.target);
      }
    },
    { threshold: 0.5 }
  );
  return io;
}

/** Watch a tile for its first on-screen impression. Returns a cleanup fn. */
export function observeImpression(el: Element, id: string): () => void {
  const obs = observer();
  if (!obs) return () => {};
  idFor.set(el, id);
  obs.observe(el);
  return () => {
    obs.unobserve(el);
    idFor.delete(el);
  };
}

if (typeof window !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("pagehide", flush);
}
