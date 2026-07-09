"use client";

import { useSyncExternalStore } from "react";

/**
 * Session-wide set of item ids whose image failed to load in-browser. Mirrors
 * hiddenStore: module-level state that SURVIVES client-side route navigation
 * (only a full reload clears it).
 *
 * Why this exists: a hotlinked candidate can 403 / rate-limit / fail to decode in
 * the browser even when the URL was reachable server-side. PinCard drops that tile
 * on error — but that removal used to live in MasonryFeed's LOCAL state, so the
 * dead tile came back the moment the grid remounted (returning from a detail view,
 * or the same broken image appearing on the library / search / "threads" grids).
 * Recording it here keeps a broken image gone across every surface for the session,
 * exactly like a hide — without persisting it server-side (the URL may work later).
 */
let broken = new Set<string>();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function markBroken(id: string) {
  if (broken.has(id)) return;
  // New Set reference so the useSyncExternalStore snapshot changes identity and
  // subscribers re-render; the old reference stays stable between mutations.
  broken = new Set(broken);
  broken.add(id);
  emit();
}

export function isBroken(id: string) {
  return broken.has(id);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

const EMPTY: Set<string> = new Set();

/** Reactive view of the broken set. Stable reference until something breaks. */
export function useBrokenSet(): Set<string> {
  return useSyncExternalStore(
    subscribe,
    () => broken,
    () => EMPTY // server render: nothing broken yet
  );
}
