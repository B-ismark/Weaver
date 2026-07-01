"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, ViewTransition } from "react";
import type { FeedItem } from "@/lib/feed";
import { logEngagement } from "@/lib/engagement";
import { shouldOptimize } from "@/lib/imageHost";
import { recordImpression } from "@/lib/impressions";
import { ItemActions } from "./ItemActions";

/**
 * One feed item — a FRAMELESS gallery tile (not a floating card).
 *
 * Deliberately un-Pinterest: no white card, no gray padding, no always-on caption
 * strip. The image goes edge-to-edge with a tight radius; caption + platform live
 * in an on-demand gradient overlay revealed on hover/focus, so the wall reads as
 * curated imagery, not a pinboard. A hairline gold frame (the web-hub colour)
 * fades in on hover to tie the tile to the weave identity.
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
  const cardRef = useRef<HTMLElement>(null);

  // Record an impression once the tile is at least half visible, so the feed can
  // stop showing it after the grace window (migration 0016 / /api/impression).
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            recordImpression(item.id);
            io.disconnect();
            break;
          }
        }
      },
      { threshold: 0.5 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [item.id]);

  return (
    <article ref={cardRef} className="group relative overflow-hidden rounded-lg">
      {/* Actions overlay — visible on hover, and whenever focused (keyboard). */}
      {showActions && (
        <div className="absolute right-2 top-2 z-20 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <ItemActions
            itemId={item.id}
            sourceLink={item.sourceLink}
            caption={item.caption}
            initialLiked={item.saved}
            onResolved={onResolved}
          />
        </div>
      )}

      <Link
        href={`/item/${item.id}`}
        onClick={() => logEngagement(item.id, "click")}
        className="block focus-visible:outline-none"
        aria-label={item.caption || "Untitled image"}
      >
        <div
          className="relative w-full bg-surface"
          style={{ aspectRatio: `${item.width} / ${item.height}` }}
        >
          {/* Shimmer skeleton until the thumb decodes — no blank flash. */}
          <div
            aria-hidden="true"
            className={`skeleton absolute inset-0 transition-opacity duration-500 ${
              loaded ? "opacity-0" : "opacity-100"
            }`}
          />
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
