"use client";

import { useSyncExternalStore } from "react";

/**
 * A tiny "reshuffle the home feed" signal. Hiding a tile on the home page should
 * make the wall feel fresh again — but WITHOUT a server round-trip or a scroll
 * jump. So instead of re-fetching, we just bump this nonce; InfiniteFeed listens
 * and reshuffles the cards it already has (and drops any now-liked ones).
 *
 * Module-level, like the liked/hidden stores, so a deep-in-the-tree action button
 * can nudge the top-level feed without prop-drilling a callback.
 */
let nonce = 0;
const listeners = new Set<() => void>();

export function requestFeedRefresh() {
  nonce++;
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useFeedRefreshNonce(): number {
  return useSyncExternalStore(
    subscribe,
    () => nonce,
    () => 0
  );
}
