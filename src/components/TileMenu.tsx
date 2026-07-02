"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { logEngagement } from "@/lib/engagement";
import { useLiked, setLiked } from "@/lib/likedStore";
import { sendSignal } from "@/lib/signals";
import { useHideItem } from "@/lib/useHideItem";

/**
 * Right-click / long-press context menu for a feed tile — the fast way to steer
 * taste without opening the detail view. Exposes the four steering actions:
 *   Like · Not my taste · More like this · Less like this
 * all backed by the same stores/signals as the overlay buttons and TasteNudge,
 * so state stays in sync everywhere (the heart, the hidden set, the feed).
 *
 * Rendered in a portal (the tile itself is overflow-hidden) at the pointer, then
 * clamped inside the viewport. Closes on select, Escape, outside-press, or scroll.
 * a11y: role="menu" with real buttons, focus moved in on open, Escape to dismiss.
 */
export function TileMenu({
  itemId,
  x,
  y,
  initialLiked = false,
  onResolved,
  onClose,
}: {
  itemId: string;
  x: number;
  y: number;
  initialLiked?: boolean;
  onResolved?: (id: string) => void;
  onClose: () => void;
}) {
  const liked = useLiked(itemId, initialLiked);
  const hide = useHideItem();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  // Clamp inside the viewport once we know the menu's real size.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const pad = 8;
    const nx = Math.min(x, window.innerWidth - width - pad);
    const ny = Math.min(y, window.innerHeight - height - pad);
    setPos({ x: Math.max(pad, nx), y: Math.max(pad, ny) });
    el.focus();
  }, [x, y]);

  // Dismiss on Escape, outside-press, scroll or resize.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("scroll", onClose, { passive: true });
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("scroll", onClose);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  function toggleLike() {
    const next = !liked;
    setLiked(itemId, next);
    logEngagement(itemId, next ? "save" : "dismiss");
    sendSignal(itemId, next ? "save" : "unsave").catch(() => {});
    onClose();
  }
  function notMyTaste() {
    hide(itemId);
    onResolved?.(itemId);
    onClose();
  }
  function nudge(action: "more" | "less") {
    sendSignal(itemId, action).catch(() => {});
    onClose();
  }

  const item =
    "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface focus-visible:bg-surface focus-visible:outline-none";

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label="Tile actions"
      tabIndex={-1}
      className="fixed z-50 min-w-44 rounded-xl border border-surface bg-background/95 p-1.5 shadow-xl backdrop-blur"
      style={{ left: pos.x, top: pos.y }}
    >
      <button type="button" role="menuitem" className={item} onClick={toggleLike}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill={liked ? "#c9a227" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
        </svg>
        {liked ? "Unlike" : "Like"}
      </button>
      <button type="button" role="menuitem" className={item} onClick={() => nudge("more")}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        More like this
      </button>
      <button type="button" role="menuitem" className={item} onClick={() => nudge("less")}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12h14" />
        </svg>
        Less like this
      </button>
      <div className="my-1 h-px bg-surface" aria-hidden="true" />
      <button type="button" role="menuitem" className={item} onClick={notMyTaste}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="6" cy="6" r="3" />
          <circle cx="6" cy="18" r="3" />
          <line x1="20" y1="4" x2="8.12" y2="15.88" />
          <line x1="14.47" y1="14.48" x2="20" y2="20" />
          <line x1="8.12" y1="8.12" x2="12" y2="12" />
        </svg>
        Not my taste
      </button>
    </div>,
    document.body
  );
}
