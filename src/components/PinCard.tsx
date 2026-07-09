"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { animate } from "motion";
import type { FeedItem } from "@/lib/feed";
import { logEngagement } from "@/lib/engagement";
import { shouldOptimize } from "@/lib/imageHost";
import { observeImpression } from "@/lib/impressions";
import { markBroken } from "@/lib/brokenStore";
import { openMorph, readMorph, subscribeMorph, type MorphActive } from "./morph/morphStore";
import { TileActionBar } from "./TileActionBar";

// Long-press to summon the action bar; a drag past this many px first is a scroll,
// not a press, so the bar never opens by accident (fixes the old "first tile
// highlighted on touch" bug). Tuned so a deliberate hold registers but a
// flick-scroll doesn't.
const LONG_PRESS_MS = 380;
const MOVE_CANCEL_PX = 12;

// Reflow tuning: how far a neighbour is shoved out along its radial from the
// opening tile, and the spring it rides. Matches the hero's response/damping so
// the whole gesture reads as one physical system.
const PUSH_PX = 96;
const PUSH_SPRING = { type: "spring", stiffness: 210, damping: 26 } as const;
const RETURN_SPRING = { type: "spring", stiffness: 260, damping: 30 } as const;

function reduceMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

type BarMode = "touch" | "menu" | null;

/**
 * One feed item — a FRAMELESS gallery tile (not a floating card).
 *
 * Two interactions live here:
 *   1. TAP → opens the detail overlay with a shared-element morph. On tap the tile
 *      publishes its rect to MorphContext; the intercepted @modal hero flies out
 *      of that rect while this tile's neighbours are pushed aside (the reflow,
 *      run imperatively below so hundreds of mounted tiles don't re-render). The
 *      `morph` prop gates this — off on secondary grids (detail/modal "Threads
 *      from this") so those tiles don't reflow a still-mounted feed behind them.
 *   2. LONG-PRESS (touch) / hover (pointer) → the bottom TileActionBar: like,
 *      more, less, not-my-taste. On touch you slide across the icons and release
 *      on one (release-to-pick); on pointer devices each icon is a normal button.
 *
 * a11y/efficiency: intrinsic box reserved from aspect ratio (no layout shift),
 * shimmer until decode, ONE shared impression observer, reflow gated to
 * in-viewport tiles and skipped entirely under prefers-reduced-motion.
 */
export function PinCard({
  item,
  priority = false,
  showActions = true,
  morph = true,
  onResolved,
}: {
  item: FeedItem;
  priority?: boolean;
  showActions?: boolean;
  // Participate in the tile→detail morph + neighbour reflow. Off on secondary
  // grids so a tile there can't drive the still-mounted feed's reflow.
  morph?: boolean;
  onResolved?: (id: string) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const cardRef = useRef<HTMLElement>(null);

  const canMorph = morph;

  // Action-bar gesture state.
  const [barMode, setBarMode] = useState<BarMode>(null);
  const [commitSeq, setCommitSeq] = useState(0);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const pointerId = useRef<number | null>(null);
  // Set when a long-press fires, so the synthetic click it produces on release is
  // swallowed instead of navigating. Reset at the start of every fresh gesture.
  const blockClick = useRef(false);

  const clearPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    pressStart.current = null;
  };

  const closeBar = () => {
    setBarMode(null);
    const id = pointerId.current;
    if (id != null) {
      try {
        cardRef.current?.releasePointerCapture(id);
      } catch {
        /* capture may already be gone */
      }
      pointerId.current = null;
    }
  };

  const openTouchBar = () => {
    clearPress();
    blockClick.current = true; // the release click must not navigate
    setBarMode("touch");
    navigator.vibrate?.(12);
    const id = pointerId.current;
    if (id != null) {
      try {
        cardRef.current?.setPointerCapture(id); // keep receiving moves off-tile
      } catch {
        /* ignore */
      }
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!showActions || barMode) return;
    blockClick.current = false; // fresh gesture
    if (e.pointerType !== "touch") return; // pointer devices use hover, not press
    pointerId.current = e.pointerId;
    pressStart.current = { x: e.clientX, y: e.clientY };
    pressTimer.current = setTimeout(openTouchBar, LONG_PRESS_MS);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (barMode === "touch") {
      e.preventDefault(); // we own the gesture now — don't let the page scroll
      return; // TileActionBar tracks the finger itself (window pointermove)
    }
    const s = pressStart.current;
    if (!s) return;
    if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > MOVE_CANCEL_PX) clearPress();
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (barMode === "touch") {
      e.preventDefault();
      setCommitSeq((n) => n + 1); // TileActionBar commits the highlighted action
      return;
    }
    clearPress();
  };

  const onPointerCancel = () => {
    clearPress();
    if (barMode === "touch") closeBar();
  };

  // Right-click (pointer): open the bar as a menu, dismissed by Escape / outside.
  const onContextMenu = (e: React.MouseEvent) => {
    if (!showActions) return;
    e.preventDefault();
    setBarMode("menu");
  };
  useEffect(() => {
    if (barMode !== "menu") return;
    const onDown = (e: PointerEvent) => {
      if (!cardRef.current?.contains(e.target as Node)) closeBar();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeBar();
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [barMode]);

  useEffect(() => () => clearPress(), []);

  // Impression tracking (migration 0016) — one shared observer for the whole feed.
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    return observeImpression(el, item.id);
  }, [item.id]);

  // ── The spatial reflow ──────────────────────────────────────────────────────
  // Imperative, driven by MorphContext, so opening a tile never re-renders the
  // (potentially hundreds of) mounted tiles. Each tile animates its OWN node and
  // self-gates on viewport visibility.
  const pushed = useRef(false);
  useEffect(() => {
    if (!canMorph) return;
    const node = cardRef.current;
    if (!node) return;
    const reduce = reduceMotion();

    const apply = (active: MorphActive) => {
      // Closed → settle everything back and reveal.
      if (!active) {
        node.style.opacity = "";
        if (pushed.current) {
          pushed.current = false;
          if (reduce) node.style.transform = "";
          else animate(node, { x: 0, y: 0, scale: 1, opacity: 1 }, RETURN_SPRING);
        }
        return;
      }
      // This IS the source tile: it never gets pushed. Stay visible while opening
      // (the overlay occludes it anyway, so there's no vanish-flash during load);
      // hide it only as the hero flies home, then the `!active` branch reveals it.
      if (active.id === item.id) {
        node.style.transform = "";
        node.style.opacity = active.phase === "closing" ? "0" : "";
        return;
      }
      // A neighbour. On close, settle back (only if we actually pushed it).
      if (active.phase === "closing") {
        if (pushed.current) {
          pushed.current = false;
          if (reduce) {
            node.style.transform = "";
            node.style.opacity = "";
          } else {
            animate(node, { x: 0, y: 0, scale: 1, opacity: 1 }, RETURN_SPRING);
          }
        }
        return;
      }
      // Opening → push out along the radial from the opening tile, if on-screen.
      if (reduce) return;
      const r = node.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) return; // offscreen: skip
      const cx = active.rect.left + active.rect.width / 2;
      const cy = active.rect.top + active.rect.height / 2;
      const nx = r.left + r.width / 2;
      const ny = r.top + r.height / 2;
      let dx = nx - cx;
      let dy = ny - cy;
      const dist = Math.hypot(dx, dy) || 1;
      dx /= dist;
      dy /= dist;
      pushed.current = true;
      node.style.willChange = "transform, opacity";
      animate(node, { x: dx * PUSH_PX, y: dy * PUSH_PX, scale: 0.92, opacity: 0 }, PUSH_SPRING);
    };

    apply(readMorph()); // catch a morph already open when this tile mounts
    return subscribeMorph(() => apply(readMorph()));
  }, [canMorph, item.id]);

  const onTap = (e: React.MouseEvent) => {
    if (blockClick.current) {
      e.preventDefault();
      blockClick.current = false;
      return;
    }
    if (canMorph && cardRef.current) {
      openMorph(item.id, cardRef.current.getBoundingClientRect());
    }
    logEngagement(item.id, "click");
  };

  const dimNeighbours = barMode === "touch";

  return (
    <article
      ref={cardRef}
      data-morph-id={item.id}
      className="group relative overflow-hidden rounded-lg [-webkit-touch-callout:none]"
      style={{
        touchAction: "manipulation",
        ...(dimNeighbours ? { position: "relative", zIndex: 50 } : null),
      }}
      onContextMenu={showActions ? onContextMenu : undefined}
      onPointerDown={showActions ? onPointerDown : undefined}
      onPointerMove={showActions ? onPointerMove : undefined}
      onPointerUp={showActions ? onPointerUp : undefined}
      onPointerCancel={showActions ? onPointerCancel : undefined}
    >
      {/* Dim the rest of the wall during a long-press so the pressed tile pops —
          "the other images shouldn't be too in focus". The pressed article is
          lifted above this scrim via z-50 (set on the article when dimming). */}
      {dimNeighbours &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            aria-hidden="true"
            className="fixed inset-0 z-40 bg-black/55 transition-opacity duration-200"
            onPointerUp={closeBar}
          />,
          document.body
        )}

      <Link
        href={`/item/${item.id}`}
        // No prefetch: on an infinite wall this would fire hundreds of RSC probes
        // as tiles enter view (Next's own recommendation for long link lists). The
        // detail route is force-dynamic — never prefetched anyway — and commits
        // fast on tap via its single-row query, so nothing is lost.
        prefetch={false}
        onClick={onTap}
        className="block focus-visible:outline-none"
        aria-label={item.caption || "Untitled image"}
      >
        <div
          className="relative w-full bg-surface"
          style={{ aspectRatio: `${item.width} / ${item.height}` }}
        >
          {/* Shimmer skeleton until the thumb decodes — no blank flash. Stops
              shimmering on error so a broken tile doesn't read as "loading forever"
              in contexts that keep it (no onResolved). */}
          <div
            aria-hidden="true"
            className={`${errored ? "bg-surface" : "skeleton"} absolute inset-0 transition-opacity duration-500 ${
              loaded ? "opacity-0" : "opacity-100"
            }`}
          />
          {errored && (
            <div className="absolute inset-0 flex items-center justify-center p-3 text-center text-xs text-muted">
              {item.caption || "Image unavailable"}
            </div>
          )}
          <Image
            src={item.thumbUrl}
            alt={item.caption}
            fill
            priority={priority}
            unoptimized={!shouldOptimize(item.thumbUrl)}
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 220px"
            onLoad={() => setLoaded(true)}
            // A hotlinked candidate can fail in-browser (host referer block,
            // rate-limit, decode) even when the URL is reachable server-side.
            // Record it in the session broken store so it stays gone across
            // navigation and every grid, and drop it from this grid now
            // (onResolved); standalone uses fall back to the caption below.
            onError={() => {
              setErrored(true);
              markBroken(item.id);
              onResolved?.(item.id);
            }}
            className={`object-cover transition-[opacity,transform] duration-700 [@media(hover:hover)]:group-hover:scale-[1.03] ${
              loaded ? "scale-100 opacity-100" : "scale-105 opacity-0"
            }`}
          />

          {/* On-demand caption: revealed on hover/focus. Hover is gated to
              hover-capable devices so it doesn't stick lit after a phone tap. */}
          {item.caption && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end bg-gradient-to-t from-black/70 via-black/25 to-transparent p-3 opacity-0 transition-opacity duration-300 group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100">
              <p className="truncate text-sm font-medium text-white">{item.caption}</p>
            </div>
          )}

          {/* Hairline gold frame on hover, the weave signature. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-lg opacity-0 ring-1 ring-inset ring-accent/60 transition-opacity duration-300 [@media(hover:hover)]:group-hover:opacity-100"
          />
        </div>
      </Link>

      {/* Bottom action bar — sibling of the Link so its buttons never navigate. */}
      {showActions && (
        <TileActionBar
          itemId={item.id}
          caption={item.caption}
          initialLiked={item.saved}
          open={barMode !== null}
          dragging={barMode === "touch"}
          commitSeq={commitSeq}
          onClose={closeBar}
        />
      )}
    </article>
  );
}
