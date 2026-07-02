"use client";

import { useRef } from "react";
import { logEngagement } from "@/lib/engagement";
import { useLiked, setLiked } from "@/lib/likedStore";
import { sendSignal } from "@/lib/signals";

/**
 * Compact like-only toggle — the SINGLE steering action kept on a feed tile
 * (declutter): a hairline heart that reveals on hover/focus on pointer devices
 * and stays hidden on touch (no hover), where the long-press menu and detail
 * view cover it. Springy pop on like; gold fill = saved. Shares likedStore +
 * signals with ItemActions, so a like here shows everywhere for that id.
 * Motion is gated on prefers-reduced-motion.
 */
const SPRING = "cubic-bezier(0.34, 1.56, 0.64, 1)"; // overshoot → springy pop

function reduceMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

export function LikeButton({
  itemId,
  initialLiked = false,
}: {
  itemId: string;
  initialLiked?: boolean;
}) {
  const liked = useLiked(itemId, initialLiked);
  const iconRef = useRef<SVGSVGElement>(null);

  function toggle() {
    const next = !liked;
    setLiked(itemId, next);
    if (!reduceMotion()) {
      iconRef.current?.animate(
        [{ transform: "scale(1)" }, { transform: "scale(1.35)" }, { transform: "scale(1)" }],
        { duration: 320, easing: SPRING }
      );
    }
    if (typeof navigator !== "undefined") navigator.vibrate?.(next ? 18 : 8);
    if (next) logEngagement(itemId, "save");
    sendSignal(itemId, next ? "save" : "unsave").catch(() => {});
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={liked ? "Unlike" : "Like"}
      aria-pressed={liked}
      title={liked ? "Unlike" : "Like"}
      className={`flex items-center justify-center rounded-full bg-background/85 p-2 text-foreground shadow-sm backdrop-blur transition-[transform,background-color,color] duration-150 hover:-translate-y-0.5 hover:bg-background active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a227]/70 ${
        liked ? "text-[#c9a227]" : ""
      }`}
    >
      <svg
        ref={iconRef}
        width="18"
        height="18"
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
    </button>
  );
}
