"use client";

import { useEffect, useLayoutEffect, useState } from "react";

/**
 * Responsive column count for the masonry grid. Observes a container element
 * (not the window) so the layout reacts to the actual available width — works
 * inside any container, and is SSR-safe (starts at `initial`, refines on mount).
 *
 * Uses a LAYOUT effect on the client so the correct column count is committed
 * BEFORE the browser paints — killing the visible "renders at 2 wide columns,
 * then reflows to 6" flash. `ready` tells the caller when the first real
 * measurement has happened, so it can hold a skeleton until the grid is sized.
 *
 * Column target: ~220px min per column on tablet/desktop, matching the grid's
 * minmax. On phones a strict 220px min collapses to a SINGLE giant column
 * (a ~330px content width floors to 1); a discovery wall wants at least two
 * tiles across, so narrow viewports are pinned to 2 columns.
 */
const MIN_COLUMN_PX = 220;
const MAX_COLUMNS = 6;
const PHONE_MAX_PX = 540; // below this, always 2-up (mobile masonry)

// useLayoutEffect warns during SSR; fall back to useEffect on the server.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const compute = (width: number) => {
  if (width < PHONE_MAX_PX) return 2;
  return Math.max(3, Math.min(MAX_COLUMNS, Math.floor(width / MIN_COLUMN_PX)));
};

export function useColumnCount(
  ref: React.RefObject<HTMLElement | null>,
  initial = 2
): { cols: number; width: number; ready: boolean } {
  const [cols, setCols] = useState(initial);
  // Container content width, so the grid can COMPUTE each tile's height from its
  // aspect ratio instead of measuring the rendered node (which needed a
  // per-tile ResizeObserver). One observer here feeds the whole grid.
  const [width, setWidth] = useState(0);
  const [ready, setReady] = useState(false);

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Synchronous first measurement — happens in the same commit as `ready`,
    // so the first painted frame already has the right column count.
    const w = el.clientWidth;
    setWidth(w);
    setCols(compute(w));
    setReady(true);

    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect.width ?? el.clientWidth;
      setWidth((prev) => (prev === cw ? prev : cw));
      setCols((prev) => {
        const next = compute(cw);
        return next === prev ? prev : next;
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  return { cols, width, ready };
}
