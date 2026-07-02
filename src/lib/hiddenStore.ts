"use client";

import { useSyncExternalStore } from "react";

/**
 * Session-wide set of "not my taste" (hidden) item ids, shared across every
 * mounted feed grid. Mirrors likedStore: module-level state that SURVIVES
 * client-side route navigation (only a full reload clears it).
 *
 * Why this exists: hiding a tile persists server-side via /api/signal, but the
 * home feed is served from the Next.js client cache on `router.back()` (returning
 * from the detail view) — so a just-hidden tile would reappear until the server
 * copy is re-fetched. Filtering the grid against this store keeps a hidden tile
 * gone the instant it's hidden, no matter how you navigate back to it.
 */
let hidden = new Set<string>();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function hideItem(id: string) {
  if (hidden.has(id)) return;
  // New Set reference so the useSyncExternalStore snapshot changes identity and
  // subscribers re-render; the old reference stays stable between mutations.
  hidden = new Set(hidden);
  hidden.add(id);
  emit();
}

export function isHidden(id: string) {
  return hidden.has(id);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

const EMPTY: Set<string> = new Set();

/** Reactive view of the hidden set. Stable reference until something is hidden. */
export function useHiddenSet(): Set<string> {
  return useSyncExternalStore(
    subscribe,
    () => hidden,
    () => EMPTY // server render: nothing hidden yet
  );
}
