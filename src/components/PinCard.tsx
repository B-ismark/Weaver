"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, ViewTransition } from "react";
import type { FeedItem } from "@/lib/feed";
import { logEngagement } from "@/lib/engagement";
import { shouldOptimize } from "@/lib/imageHost";
import { observeImpression } from "@/lib/impressions";
import { LikeButton } from "./LikeButton";
import { TileMenu } from "./TileMenu";

// Long-press duration + movement tolerance for opening the tile menu on touch.
const LONG_PRESS_MS = 450;
const MOVE_CANCEL_PX = 10;

/**
 * One feed item — a FRAMELESS gallery tile (not a floating card).
 *
 * Deliberately un-Pinterest and DECLUTTERED: no white card, no gray padding, no
 * always-on caption strip, no 3-button action strip — the wall reads as pure
 * curated imagery. The ONLY on-tile control is a subtle heart that reveals on
 * hover/focus (pointer devices) and stays hidden on touch; deeper taste steering
 * lives in the long-press / right-click menu and the detail view. Fewer
 * components per tile = smoother mobile scroll. The image goes edge-to-edge with
 * a tight radius; caption + a hairline gold frame reveal on hover/focus to tie
 * the tile to the weave identity.
 *
 * - Reserves space via intrinsic width/height → no layout shift (a11y/efficiency).
 * - Shimmer skeleton shows until the thumb decodes — no blank flash.
 * - Tapping opens the in-app detail view (§2); the source-out link lives there.
 * - Overlay caption + actions stay keyboard-reachable (focus-within reveals them).
 */
export function PinCard({
  item,
  priority = false,
  showActions = true,
  onResolved,
}: {
  item: FeedItem;
  priority?: boolean;
  showActions?: boolean;
  onResolved?: (id: string) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const cardRef = useRef<HTMLElement>(null);

  // Context menu (right-click / long-press) → the four taste actions. `suppress`
  // swallows the click that a touch long-press would otherwise fire on release,
  // so opening the menu never also navigates into the detail view.
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const suppress = useRef(false);

  const clearPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    pressStart.current = null;
  };

  const openMenu = (x: number, y: number) => {
    clearPress();
    setMenu({ x, y });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch" || menu) return;
    suppress.current = false; // fresh gesture — clear any stale long-press flag
    pressStart.current = { x: e.clientX, y: e.clientY };
    pressTimer.current = setTimeout(() => {
      // A long-press fires a synthetic click on release — flag it for swallowing.
      suppress.current = true;
      navigator.vibrate?.(12);
      openMenu(e.clientX, e.clientY);
    }, LONG_PRESS_MS);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const s = pressStart.current;
    if (!s) return;
    if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > MOVE_CANCEL_PX) clearPress();
  };

  // Record an impression once the tile is at least half visible, so the feed can
  // stop showing it after the grace window (migration 0016 / /api/impression).
  // Uses ONE shared observer for the whole feed (see impressions.ts) rather than
  // an observer per tile.
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    return observeImpression(el, item.id);
  }, [item.id]);

  return (
    <article
      ref={cardRef}
      className="group relative overflow-hidden rounded-lg [-webkit-touch-callout:none]"
      onContextMenu={
        showActions
          ? (e) => {
              e.preventDefault();
              openMenu(e.clientX, e.clientY);
            }
          : undefined
      }
      onPointerDown={showActions ? onPointerDown : undefined}
      onPointerMove={showActions ? onPointerMove : undefined}
      onPointerUp={clearPress}
      onPointerCancel={clearPress}
    >
      {/* A single subtle heart — the only action left ON the tile (declutter).
          Hover/focus-reveal on pointer devices; hidden on touch (no hover),
          where the long-press menu below and the detail view's full action bar
          cover it. Sits outside the Link so a tap likes, not navigates. */}
      {showActions && (
        <div className="absolute right-2 top-2 z-20 opacity-0 transition-opacity duration-200 focus-within:opacity-100 group-hover:opacity-100">
          <LikeButton itemId={item.id} initialLiked={item.saved} />
        </div>
      )}

      {menu && (
        <TileMenu
          itemId={item.id}
          x={menu.x}
          y={menu.y}
          initialLiked={item.saved}
          onResolved={onResolved}
          onClose={() => setMenu(null)}
        />
      )}

      <Link
        href={`/item/${item.id}`}
        // No prefetch: on an infinite wall this would fire hundreds of RSC probes
        // as tiles enter view (Next's own recommendation for long link lists). The
        // detail route is force-dynamic — never prefetched anyway — and commits
        // fast on tap via its single-row query, so nothing is lost.
        prefetch={false}
        onClick={(e) => {
          // A touch long-press synthesises a click on release — swallow it so
          // opening the menu doesn't also open the detail view.
          if (suppress.current) {
            e.preventDefault();
            suppress.current = false;
            return;
          }
          logEngagement(item.id, "click");
        }}
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
          {/* Shared-element morph: this thumbnail is the same node as the detail
              hero (same name) — the browser animates it expanding on navigation.
              default="none" is REQUIRED: without it this ViewTransition fires its
              enter animation on EVERY unrelated transition (the first client
              navigation into the feed, any Suspense reveal), so all tiles flash out
              at once and the header snapshot jumps. With it, the tile only animates
              when it IS the shared element being morphed into the detail hero. */}
          <ViewTransition name={`item-${item.id}`} share="morph" default="none">
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
              // Without this the tile stays a permanent black hole. Drop it from the
              // grid (onResolved) so the feed reflows; standalone uses fall back to
              // the caption placeholder below.
              onError={() => {
                setErrored(true);
                onResolved?.(item.id);
              }}
              className={`object-cover transition-[opacity,transform] duration-700 group-hover:scale-[1.03] ${
                loaded ? "scale-100 opacity-100" : "scale-105 opacity-0"
              }`}
            />
          </ViewTransition>

          {/* On-demand caption: gradient scrim + text, revealed on hover/focus. */}
          {item.caption && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end bg-gradient-to-t from-black/70 via-black/25 to-transparent p-3 opacity-0 transition-opacity duration-300 group-focus-within:opacity-100 group-hover:opacity-100">
              <p className="truncate text-sm font-medium text-white">{item.caption}</p>
            </div>
          )}

          {/* Hairline gold frame on hover, the weave signature. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-lg opacity-0 ring-1 ring-inset ring-accent/60 transition-opacity duration-300 group-hover:opacity-100"
          />
        </div>
      </Link>
    </article>
  );
}
