"use client";

import { useSyncExternalStore } from "react";

/**
 * Session-wide liked state, shared across every mounted ItemActions (grid tiles
 * AND the detail view). Liking in one place updates all instances for that id
 * immediately, so a like made in the detail view shows on the grid tile when you
 * navigate back (and vice-versa) — without a refetch, which would drop the item
 * from the candidate feed.
 *
 * Server persistence still happens via /api/signal; on a fresh page load the
 * heart is seeded from the server `saved` flag (role='taste'), then this store
 * takes over for the session. Module-level state survives client-side route
 * navigation (it's only reset on a full reload).
 */
const state = new Map<string, boolean>();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function setLiked(id: string, value: boolean) {
  state.set(id, value);
  emit();
}

/** Ids liked this session — used to drop already-liked cards on a feed reshuffle. */
export function getLikedIds(): Set<string> {
  const ids = new Set<string>();
  for (const [id, value] of state) if (value) ids.add(id);
  return ids;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * Read the liked state for an id, falling back to `initial` (the server-persisted
 * value) until the user toggles it this session.
 */
export function useLiked(id: string, initial: boolean): boolean {
  const getSnapshot = () => (state.has(id) ? (state.get(id) as boolean) : initial);
  // Server render + hydration use the seed so markup matches.
  return useSyncExternalStore(subscribe, getSnapshot, () => initial);
}
