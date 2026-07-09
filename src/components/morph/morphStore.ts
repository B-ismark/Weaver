"use client";

/**
 * Coordinates the tile → detail "shared element" morph and the surrounding
 * spatial reflow, ACROSS the parallel-route boundary (the feed lives in the
 * `children` slot, the enlarged view in the `@modal` slot — see app/layout).
 *
 * A module-level singleton (like likedStore / hiddenStore / undoStore), NOT React
 * state, for two reasons:
 *   1. Only ever one morph is open at a time — a singleton models that exactly.
 *   2. A discovery wall holds hundreds of mounted tiles. If the active entry were
 *      React state, opening one tile would re-render every tile on the exact frame
 *      the morph starts — a jank spike. Instead tiles `subscribe` and, in the
 *      callback, imperatively animate their own DOM node. Zero React renders on
 *      open/close; each tile self-gates on viewport visibility.
 *
 * `phase` splits the close into two beats so it reads organically:
 *   - `open`    : source tile hidden as the hero flies home is deferred; neighbours
 *                 pushed out (source stays visible, occluded by the overlay).
 *   - `closing` : neighbours settle back WHILE the hero flies home; the source tile
 *                 is hidden so there's never a double image mid-flight.
 *   - (null)    : fully closed — the source tile is revealed again.
 */
export type MorphActive = { id: string; rect: DOMRect; phase: "open" | "closing" } | null;

let active: MorphActive = null;
const subscribers = new Set<() => void>();

function emit() {
  for (const s of subscribers) s();
}

/** A tile was tapped: record it as the morph source and notify subscribers. */
export function openMorph(id: string, rect: DOMRect) {
  active = { id, rect, phase: "open" };
  emit();
}

/** Reverse has started: settle neighbours back, keep the source tile hidden. */
export function beginCloseMorph() {
  if (!active || active.phase === "closing") return;
  active = { ...active, phase: "closing" };
  emit();
}

/** The hero has landed: clear the source and reveal the tile. */
export function closeMorph() {
  if (!active) return;
  active = null;
  emit();
}

/** Current morph source (null when nothing is open). */
export function readMorph(): MorphActive {
  return active;
}

/** Subscribe to open/close; returns an unsubscribe. */
export function subscribeMorph(cb: () => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}
