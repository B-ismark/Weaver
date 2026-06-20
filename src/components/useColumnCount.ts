"use client";

import { useEffect, useState } from "react";

/**
 * Responsive column count for the masonry grid. Observes a container element
 * (not the window) so the layout reacts to the actual available width — works
 * inside any container, and is SSR-safe (starts at `initial`, refines on mount).
 *
 * Column target: ~220px min per column, matching the grid's minmax.
 */
const MIN_COLUMN_PX = 220;
const MAX_COLUMNS = 6;

export function useColumnCount(
  ref: React.RefObject<HTMLElement | null>,
  initial = 2
): number {
  const [cols, setCols] = useState(initial);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const compute = (width: number) =>
      Math.max(1, Math.min(MAX_COLUMNS, Math.floor(width / MIN_COLUMN_PX)));

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

  return cols;
}
