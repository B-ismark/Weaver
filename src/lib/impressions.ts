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

if (typeof window !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("pagehide", flush);
}
