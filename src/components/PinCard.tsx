"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { FeedItem } from "@/lib/feed";
import { logEngagement } from "@/lib/engagement";
import { ItemActions } from "./ItemActions";

/**
 * One feed item. Reusable, self-contained display unit (component principle).
 * - Reserves space via intrinsic width/height → no layout shift (a11y/efficiency).
 * - Blur-up: a surface-colored skeleton shows until the thumb loads.
 * - Tapping opens the in-app detail view (§2); the source-out link lives there.
 * - Hover/focus reveals Save / Hide / Share actions (kept accessible via focus).
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

  return (
    <article className="group relative">
      {/* Actions overlay — visible on hover, and whenever focused (keyboard). */}
      {showActions && (
        <div className="absolute right-2 top-2 z-10 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
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
        className="block overflow-hidden rounded-2xl bg-surface focus-visible:outline-none"
        aria-label={`${item.caption || "Untitled"} — from ${item.platform}`}
      >
        <div className="relative w-full" style={{ aspectRatio: `${item.width} / ${item.height}` }}>
          <Image
            src={item.thumbUrl}
            alt={item.caption}
            fill
            priority={priority}
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 220px"
            onLoad={() => setLoaded(true)}
            className={`object-cover transition-opacity duration-300 ${
              loaded ? "opacity-100" : "opacity-0"
            }`}
          />
        </div>
      </Link>
      <div className="mt-2 flex items-center justify-between gap-2 px-1">
        <p className="truncate text-sm text-foreground">{item.caption}</p>
        <span className="shrink-0 text-xs capitalize text-muted">{item.platform}</span>
      </div>
    </article>
  );
}
