"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import autoAnimate from "@formkit/auto-animate";
import type { FeedItem } from "@/lib/feed";
import { PinCard } from "./PinCard";
import { SkeletonFeed } from "./SkeletonFeed";
import { useColumnCount } from "./useColumnCount";
import { useHiddenSet } from "@/lib/hiddenStore";

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
 * The native CSS Grid masonry ("grid lanes") will replace this compute-and-span
 * dance once it ships across engines (~late 2026); the markup is already ready.
 */
// 1px auto-rows (with zero row-gap) give the span near-pixel granularity, so a
// tile's allocated height matches its real height and the waterfall doesn't leave
// ragged vertical gaps. The visual gap between stacked tiles is folded INTO the
// span (+GAP_PX rows) rather than coming from a coarse grid row-gap.
const ROW_PX = 1;
const GAP_PX = 16;

/**
 * A tile's height is fully determined by its column width and the image's
 * intrinsic aspect ratio (PinCard reserves that exact box) — so we COMPUTE it
 * instead of measuring the rendered node. This retired the per-tile
 * ResizeObserver + getBoundingClientRect that fired on every scroll frame and
 * decode, the main mobile-scroll jank source.
 *
 * `content-visibility: auto` then lets the browser skip layout & paint for tiles
 * off-screen — the single biggest win on a long feed — while `contain-intrinsic-
 * size` keeps the scroll height stable so the bar doesn't jump.
 */
function MasonryCell({
  item,
  priority,
  showActions,
  feature,
  colWidth,
  onResolved,
}: {
  item: FeedItem;
  priority: boolean;
  showActions: boolean;
  feature: boolean;
  colWidth: number;
  onResolved?: (id: string) => void;
}) {
  const ratio = item.width > 0 ? item.height / item.width : 1;
  const h = colWidth > 0 ? colWidth * ratio : 0;
  const span = Math.max(1, Math.ceil(h) + GAP_PX);

  return (
    <div
      style={{
        gridRowEnd: `span ${span}`,
        gridColumn: feature ? "span 2" : undefined,
        contentVisibility: "auto",
        // `auto` remembers the real size once rendered; the computed height is
        // the placeholder until then.
        containIntrinsicSize: h > 0 ? `auto ${Math.ceil(h)}px` : undefined,
      }}
    >
      <PinCard item={item} priority={priority} showActions={showActions} onResolved={onResolved} />
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
  const { cols, width, ready } = useColumnCount(containerRef);
  // Pixel width of one column track (minmax(0,1fr) share of the row after gaps),
  // feeding each cell's computed height.
  const unit = cols > 0 && width > 0 ? (width - (cols - 1) * GAP_PX) / cols : 0;

  // Local copy so saved/hidden/broken tiles disappear optimistically.
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());
  // Session-wide hidden set (survives client navigation) — so a tile marked "not
  // my taste" stays gone when you return from the detail view, even though the
  // cached feed still contains it.
  const hidden = useHiddenSet();
  // Dedup defensively at render by source image URL (not just id): the same image
  // can slip in under two ids (CDN variants, a race before the unique index), and
  // near-identical embeddings rank them adjacent — so a stray dupe would show side
  // by side. Keep the first occurrence; id de-dup guards accidental key clashes.
  const items = useMemo(() => {
    const seen = new Set<string>();
    return initial.filter((it) => {
      if (removed.has(it.id) || hidden.has(it.id)) return false;
      const key = it.fullUrl || it.id;
      if (seen.has(key) || seen.has(it.id)) return false;
      seen.add(key);
      seen.add(it.id);
      return true;
    });
  }, [initial, removed, hidden]);
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
          items.map((item, i) => {
            const feature = isFeature(i, cols);
            // A feature tile spans 2 tracks + the gap between them.
            const colWidth = feature ? unit * 2 + GAP_PX : unit;
            return (
              // Eager-load the first row so the LCP image isn't lazy (efficiency).
              <MasonryCell
                key={item.id}
                item={item}
                priority={i < cols}
                showActions={showActions}
                feature={feature}
                colWidth={colWidth}
                onResolved={onResolved}
              />
            );
          })}
      </section>
    </>
  );
}
