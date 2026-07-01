"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, ViewTransition } from "react";
import type { FeedItem } from "@/lib/feed";
import { logEngagement } from "@/lib/engagement";
import { shouldOptimize } from "@/lib/imageHost";
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

  // Map the raw cosine taste score to a 0–100% strength. Measured live feed
  // distribution sits in ~[0.30, 0.70] (p10 .40 / p50 .55 / p90 .64), so stretch
  // that band across the bar for readable spread instead of everything pinned at
  // 100%. Null (no bar) when the RPC didn't supply a score.
  const matchPct =
    typeof item.score === "number"
      ? Math.round(Math.min(1, Math.max(0, (item.score - 0.3) / 0.4)) * 100)
      : null;

  return (
    <article className="group relative overflow-hidden rounded-lg">
      {/* Actions overlay — visible on hover, and whenever focused (keyboard). */}
      {showActions && (
        <div className="absolute right-2 top-2 z-20 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <ItemActions
            itemId={item.id}
            sourceLink={item.sourceLink}
            caption={item.caption}
            onResolved={onResolved}
          />
        </div>
      )}

      <Link
        href={`/item/${item.id}`}
        onClick={() => logEngagement(item.id, "click")}
        className="block focus-visible:outline-none"
        aria-label={`${item.caption || "Untitled"} — from ${item.platform}`}
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
              hero (same name) — the browser animates it expanding on navigation. */}
          <ViewTransition name={`item-${item.id}`} share="morph">
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
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-2 bg-gradient-to-t from-black/70 via-black/25 to-transparent p-3 opacity-0 transition-opacity duration-300 group-focus-within:opacity-100 group-hover:opacity-100">
            {item.caption && (
              <p className="truncate text-sm font-medium text-white">{item.caption}</p>
            )}
            <div className="flex shrink-0 items-center gap-1.5">
              {matchPct !== null && (
                <span className="text-[0.65rem] font-semibold tabular-nums text-accent-soft">
                  {matchPct}% match
                </span>
              )}
              <span className="text-[0.65rem] font-medium uppercase tracking-wide text-accent-soft">
                {item.platform}
              </span>
            </div>
          </div>

          {/* Taste-match strength — a woven gold thread across the base whose
              length tracks the real cosine score (migration 0015). Always faintly
              visible, brightens on hover. Decorative; the % above is the a11y text. */}
          {matchPct !== null && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-[3px] bg-black/10"
            >
              <div
                className="h-full bg-accent opacity-70 transition-opacity duration-300 group-hover:opacity-100"
                style={{ width: `${matchPct}%` }}
              />
            </div>
          )}

          {/* Hairline gold frame on hover — the weave signature. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-lg opacity-0 ring-1 ring-inset ring-accent/60 transition-opacity duration-300 group-hover:opacity-100"
          />
        </div>
      </Link>
    </article>
  );
}
