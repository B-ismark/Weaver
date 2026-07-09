"use client";

import { useRef, useState } from "react";
import { logEngagement } from "@/lib/engagement";
import { useLiked, setLiked } from "@/lib/likedStore";
import { sendSignal } from "@/lib/signals";
import { useHideItem } from "@/lib/useHideItem";
import { reduceMotion, pop, silkBurst, snip } from "@/lib/tasteAnimations";

/**
 * Save / Not-interested / Share for a feed item, with weave-themed
 * micro-interactions (orb-weaver motif):
 *   - Save  → heart springs + fills gold (the web-hub colour) and silk threads
 *             radiate out, like a fresh capture. Promotes to taste (positive).
 *   - Hide  → scissors snip the thread (shake + sever). "Not my taste" (negative).
 *   - Share → arrow glides; on copy, a check strokes itself in. Web Share API,
 *             falling back to copy-link.
 *
 * Built on the Web Animations API (no animation lib). Accessibility first:
 * real buttons, aria-labels, aria-pressed, focus-visible rings, and ALL motion
 * is gated on prefers-reduced-motion (research: motion must be optional, with a
 * non-motion fallback — here the colour/state change still happens).
 * Micro-timings sit in the 120–220ms sweet spot; the save burst is ~420ms.
 */
// The weave micro-interactions (pop / silkBurst / snip) are shared with the feed
// tile action bar — see lib/tasteAnimations.
function haptic(pattern: number | number[]) {
  if (typeof navigator !== "undefined") navigator.vibrate?.(pattern);
}

export function ItemActions({
  itemId,
  sourceLink,
  caption,
  variant = "overlay",
  initialLiked = false,
  onResolved,
}: {
  itemId: string;
  sourceLink: string;
  caption?: string;
  variant?: "overlay" | "bar";
  // Persisted like state from the server (item is in the taste set). Seeds the
  // heart so a like made on one view shows as liked on another.
  initialLiked?: boolean;
  onResolved?: (id: string) => void;
}) {
  // Shared across all instances for this id (grid tile + detail), seeded from
  // the server-persisted value.
  const liked = useLiked(itemId, initialLiked);
  const hide = useHideItem();
  const [hiding, setHiding] = useState(false);
  const [shared, setShared] = useState<"" | "copied">("");
  const saveRef = useRef<HTMLButtonElement>(null);
  const hideRef = useRef<HTMLButtonElement>(null);
  const saveIcon = useRef<SVGSVGElement>(null);
  const hideArmA = useRef<SVGGElement>(null);
  const hideArmB = useRef<SVGGElement>(null);

  // Like is a TOGGLE and does NOT remove the tile — so you can unlike, and
  // search results don't vanish when you like them. (Liked candidates leave the
  // home feed naturally on the next refresh via the "already seen" exclusion.)
  function onToggleLike() {
    if (hiding) return;
    const next = !liked;
    setLiked(itemId, next);
    pop(saveIcon.current);
    if (next) {
      silkBurst(saveRef.current);
      haptic(18);
      logEngagement(itemId, "save");
      sendSignal(itemId, "save").catch(() => {});
    } else {
      haptic(8);
      sendSignal(itemId, "unsave").catch(() => {});
    }
  }

  // Hide IS terminal — collapse the tile AFTER the snip plays, then persist. The
  // hook keeps it gone across navigation (hidden store) and refreshes the home
  // feed. Persisting after the snip lets the scissor animation finish first.
  function onHide() {
    if (hiding) return;
    setHiding(true);
    snip(hideArmA.current, hideArmB.current);
    haptic([8, 30, 8]);
    const finish = () => {
      hide(itemId);
      onResolved?.(itemId);
    };
    const d = reduceMotion() ? 0 : 340;
    if (d === 0) finish();
    else setTimeout(finish, d);
  }
  async function onShare() {
    const data = { title: caption || "Weaver", url: sourceLink };
    haptic(10);
    if (navigator.share) {
      navigator.share(data).catch(() => {});
    } else {
      await navigator.clipboard?.writeText(sourceLink).catch(() => {});
      setShared("copied");
      setTimeout(() => setShared(""), 1600);
    }
  }

  const isBar = variant === "bar";
  const base =
    "relative flex items-center justify-center gap-1.5 rounded-full transition-[transform,background-color,color] duration-150 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a227]/70 disabled:cursor-default " +
    (isBar
      ? "border border-surface bg-surface px-3 py-2 text-sm hover:bg-background"
      : "bg-background/85 p-2 text-foreground shadow-sm backdrop-blur hover:bg-background hover:-translate-y-0.5");

  const sz = isBar ? 16 : 18;

  return (
    <div className={isBar ? "flex flex-wrap gap-2" : "flex gap-1.5"}>
      {/* Like (toggle) */}
      <button
        ref={saveRef}
        type="button"
        onClick={onToggleLike}
        disabled={hiding}
        aria-label={liked ? "Unlike" : "Like, more like this"}
        aria-pressed={liked}
        title={liked ? "Unlike" : "Like"}
        className={`${base} overflow-visible ${liked ? "text-[#c9a227]" : ""}`}
      >
        <svg
          ref={saveIcon}
          width={sz}
          height={sz}
          viewBox="0 0 24 24"
          fill={liked ? "#c9a227" : "none"}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
        </svg>
        {isBar && (liked ? "Liked" : "Like")}
      </button>

      {/* Not my taste: the scissor blades snip */}
      <button
        ref={hideRef}
        type="button"
        onClick={onHide}
        disabled={hiding}
        aria-label="Not my taste, show less like this"
        title="Not my taste"
        className={base}
      >
        <svg
          width={sz}
          height={sz}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {/* Arm A: top handle + connector + lower-right blade. Pivots about the
              rivet (12,12); view-box transform-box keeps the origin in icon coords. */}
          <g ref={hideArmA} style={{ transformBox: "view-box", transformOrigin: "12px 12px" }}>
            <circle cx="6" cy="6" r="3" />
            <line x1="8.12" y1="8.12" x2="12" y2="12" />
            <line x1="14.47" y1="14.48" x2="20" y2="20" />
          </g>
          {/* Arm B: bottom handle + upper-right blade. */}
          <g ref={hideArmB} style={{ transformBox: "view-box", transformOrigin: "12px 12px" }}>
            <circle cx="6" cy="18" r="3" />
            <line x1="20" y1="4" x2="8.12" y2="15.88" />
          </g>
        </svg>
        {isBar && "Not my taste"}
      </button>

      {/* Share */}
      <button
        type="button"
        onClick={onShare}
        aria-label={shared === "copied" ? "Link copied" : "Share"}
        title="Share"
        className={`${base} ${shared === "copied" ? "text-[#c9a227]" : ""}`}
      >
        {shared === "copied" ? (
          <svg
            width={sz}
            height={sz}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            style={reduceMotion() ? undefined : { animation: "weave-draw 320ms ease-out" }}
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        ) : (
          <svg
            width={sz}
            height={sz}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M7 17 17 7" />
            <path d="M8 7h9v9" />
          </svg>
        )}
        {isBar && (shared === "copied" ? "Link copied" : "Share")}
      </button>
    </div>
  );
}
