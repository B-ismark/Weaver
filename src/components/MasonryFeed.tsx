"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FeedItem } from "@/lib/feed";
import { PinCard } from "./PinCard";
import { useColumnCount } from "./useColumnCount";

/**
 * Accessible masonry feed.
 *
 * Layout: a SINGLE CSS grid with items in source order. Each cell spans a number
 * of small auto-rows proportional to its measured height. Because every item
 * lives in one grid in DOM order, visual reading order == tab order == screen-
 * reader order (the reason we rejected CSS-columns / per-column round-robin,
 * both of which read column-major). Responsive column count comes from observing
 * the container width (useColumnCount), not hard-coded breakpoints.
 *
 * The native CSS Grid masonry ("grid lanes") will replace this measure-and-span
 * dance once it ships across engines (~late 2026); the markup is already ready.
 */
const ROW_PX = 8;
const GAP_PX = 16;

function MasonryCell({
  item,
  priority,
  showActions,
  onResolved,
}: {
  item: FeedItem;
  priority: boolean;
  showActions: boolean;
  onResolved?: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [span, setSpan] = useState(1);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const h = el.getBoundingClientRect().height;
      setSpan(Math.max(1, Math.ceil((h + GAP_PX) / (ROW_PX + GAP_PX))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div style={{ gridRowEnd: `span ${span}` }}>
      <div ref={ref}>
        <PinCard item={item} priority={priority} showActions={showActions} onResolved={onResolved} />
      </div>
    </div>
  );
}

export function MasonryFeed({
  items: initial,
  showActions = true,
}: {
  items: FeedItem[];
  showActions?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cols = useColumnCount(containerRef);

  // Local copy so saved/hidden tiles disappear optimistically.
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());
  const items = useMemo(() => initial.filter((it) => !removed.has(it.id)), [initial, removed]);
  const onResolved = (id: string) => setRemoved((prev) => new Set(prev).add(id));

  return (
    <section
      id="feed"
      ref={containerRef}
      aria-label="Your feed"
      className="grid"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridAutoRows: `${ROW_PX}px`,
        // Both row + column gap: the span formula assumes a row gap of GAP_PX,
        // so each cell's allocated height ≈ span × (ROW_PX + GAP_PX).
        gap: `${GAP_PX}px`,
      }}
    >
      {items.map((item, i) => (
        // Eager-load the first row so the LCP image isn't lazy (efficiency).
        <MasonryCell
          key={item.id}
          item={item}
          priority={i < cols}
          showActions={showActions}
          onResolved={onResolved}
        />
      ))}
    </section>
  );
}
