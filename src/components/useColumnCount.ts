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
 * Column target: ~220px min per column, matching the grid's minmax.
 */
const MIN_COLUMN_PX = 220;
const MAX_COLUMNS = 6;

// useLayoutEffect warns during SSR; fall back to useEffect on the server.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const compute = (width: number) =>
  Math.max(1, Math.min(MAX_COLUMNS, Math.floor(width / MIN_COLUMN_PX)));

export function useColumnCount(
  ref: React.RefObject<HTMLElement | null>,
  initial = 2
): { cols: number; ready: boolean } {
  const [cols, setCols] = useState(initial);
  const [ready, setReady] = useState(false);

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Synchronous first measurement — happens in the same commit as `ready`,
    // so the first painted frame already has the right column count.
    setCols(compute(el.clientWidth));
    setReady(true);

    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? el.clientWidth;
      setCols((prev) => {
        const next = compute(width);
        return next === prev ? prev : next;
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  return { cols, ready };
}
