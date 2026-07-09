"use client";

import { useSyncExternalStore } from "react";
import type { FeedItem } from "@/lib/feed";

/**
 * Drives the tile → detail overlay and the surrounding spatial reflow.
 *
 * A module-level singleton (like likedStore / hiddenStore / undoStore), NOT React
 * state, so opening a tile never re-renders the (potentially hundreds of) mounted
 * feed tiles: tiles `subscribeMorph` and imperatively animate their own node. The
 * ONE persistent <DetailOverlay/> reads it reactively via `useMorphState`.
 *
 * The overlay is fully CLIENT-side and opens instantly from the tapped item's data
 * (the grid already has `fullUrl`/`thumbUrl`/dims/caption) — no route fetch gates
 * the morph, so the hero flies the same frame the tap lands. Tapping a tile inside
 * the overlay's "Threads from this" simply calls `openMorph` again with the new
 * item → the overlay morphs into it (a drill), tracked by `seq`.
 *
 * `phase` splits the close so neighbours settle back WHILE the hero flies home:
 *   - `open`    : hero at full size, neighbours pushed out.
 *   - `closing` : neighbours return, hero flies back to the source tile.
 *   - (null)    : closed — the source tile is revealed again.
 */
export type MorphState = {
  item: FeedItem;
  /** Source tile rect for the FLIP; null → gentle scale-in (e.g. drill/back). */
  rect: DOMRect | null;
  phase: "open" | "closing";
  /** Bumps on every open/drill so the overlay re-runs the FLIP from the new rect. */
  seq: number;
} | null;

let state: MorphState = null;
let seq = 0;
const subscribers = new Set<() => void>();

function emit() {
  for (const s of subscribers) s();
}

/** Open (or drill into) an item. Captures the source tile rect for the FLIP. */
export function openMorph(item: FeedItem, rect: DOMRect | null) {
  seq += 1;
  state = { item, rect, phase: "open", seq };
  emit();
}

/** Reverse has started: settle neighbours back, hero flies home. */
export function beginCloseMorph() {
  if (!state || state.phase === "closing") return;
  state = { ...state, phase: "closing" };
  emit();
}

/** The hero has landed: clear the source and reveal the tile. */
export function closeMorph() {
  if (!state) return;
  state = null;
  emit();
}

export function readMorph(): MorphState {
  return state;
}

export function subscribeMorph(cb: () => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

/** Reactive view for the overlay host (re-renders on open/drill/close). */
export function useMorphState(): MorphState {
  return useSyncExternalStore(subscribeMorph, readMorph, () => null);
}
