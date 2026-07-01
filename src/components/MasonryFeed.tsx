"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import autoAnimate from "@formkit/auto-animate";
import type { FeedItem } from "@/lib/feed";
import { PinCard } from "./PinCard";
import { SkeletonFeed } from "./SkeletonFeed";
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
 * First paint: the column count + row spans are measured in a LAYOUT effect, and
 * the tiles are held behind a skeleton until that first measurement lands — so
 * the grid appears already at its final column count instead of flashing "2 wide
 * columns → reflow to 6". Tiles then weave in with a short staggered fade-up.
 *
 * Live mutations (save / hide / discovery refresh) are animated by AutoAnimate,
 * which reflows the surviving tiles instead of letting them jump. All of this is
 * neutralised under prefers-reduced-motion (AutoAnimate honours it natively; the
 * reveal keyframe is zeroed by the global reduced-motion override).
 *
 * The native CSS Grid masonry ("grid lanes") will replace this measure-and-span
 * dance once it ships across engines (~late 2026); the markup is already ready.
 */
// 1px auto-rows (with zero row-gap) give the span near-pixel granularity, so a
// tile's allocated height matches its real height and the waterfall doesn't leave
// ragged vertical gaps. The visual gap between stacked tiles is folded INTO the
// span (+GAP_PX rows) rather than coming from a coarse grid row-gap.
const ROW_PX = 1;
const GAP_PX = 16;

// useLayoutEffect warns during SSR; fall back to useEffect on the server.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

function MasonryCell({
  item,
  priority,
  showActions,
  feature,
  reveal,
  index,
  onResolved,
}: {
  item: FeedItem;
  priority: boolean;
  showActions: boolean;
  feature: boolean;
  reveal: boolean;
  index: number;
  onResolved?: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [span, setSpan] = useState(1);

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const h = el.getBoundingClientRect().height;
      // rows to cover the tile (1px each) + GAP_PX rows for the gap beneath it.
      setSpan(Math.max(1, Math.ceil(h) + GAP_PX));
    };
    measure();
    // A feature tile spans 2 columns → it gets WIDER, so its measured height
    // changes; the ResizeObserver already re-measures, keeping the row-span exact.
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [feature]);

  return (
    <div
      className={reveal ? "tile-reveal" : undefined}
      // Stagger the weave-in; cap the delay so a long feed doesn't trickle in.
      style={{
        gridRowEnd: `span ${span}`,
        gridColumn: feature ? "span 2" : undefined,
        animationDelay: reveal ? `${Math.min(index, 14) * 35}ms` : undefined,
      }}
    >
      <div ref={ref}>
        <PinCard item={item} priority={priority} showActions={showActions} onResolved={onResolved} />
      </div>
    </div>
  );
}

/**
 * Deterministic "feature" tiles that span 2 columns to break the uniform-brick
 * waterfall (the look that reads as Pinterest). Editorial masonry mixes track
 * widths rather than tiling identical columns. Only when there's room (≥3 cols),
 * never in the priority first row, spaced out so features don't cluster.
 */
function isFeature(index: number, cols: number): boolean {
  if (cols < 3) return false;
  return index >= cols && index % 7 === cols % 7;
}

export function MasonryFeed({
  items: initial,
  showActions = true,
}: {
  items: FeedItem[];
  showActions?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { cols, ready } = useColumnCount(containerRef);

  // Local copy so saved/hidden tiles disappear optimistically.
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());
  const items = useMemo(() => initial.filter((it) => !removed.has(it.id)), [initial, removed]);
  const onResolved = (id: string) => setRemoved((prev) => new Set(prev).add(id));

  // AutoAnimate the grid so save/hide/discovery reflow smoothly (not jump-cut).
  // Initialised once the grid is populated; honours prefers-reduced-motion itself.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !ready) return;
    const controller = autoAnimate(el, { duration: 240, easing: "ease-out" });
    return () => controller.disable();
  }, [ready]);

  return (
    <>
      {/* Hold a skeleton until the grid has measured its column count — prevents
          the first-paint reflow. Data is already present, so this is brief. */}
      {!ready && <SkeletonFeed count={12} />}

      <section
        id="feed"
        ref={containerRef}
        aria-label="Your feed"
        aria-busy={!ready}
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridAutoRows: `${ROW_PX}px`,
          // Zero row-gap (the vertical gap is baked into each cell's span);
          // real gap only between columns.
          rowGap: 0,
          columnGap: `${GAP_PX}px`,
        }}
      >
        {ready &&
          items.map((item, i) => (
            // Eager-load the first row so the LCP image isn't lazy (efficiency).
            <MasonryCell
              key={item.id}
              item={item}
              priority={i < cols}
              showActions={showActions}
              feature={isFeature(i, cols)}
              reveal={ready}
              index={i}
              onResolved={onResolved}
            />
          ))}
      </section>
    </>
  );
}
