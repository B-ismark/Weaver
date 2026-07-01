"use client";

import { useRef, useState } from "react";
import { logEngagement } from "@/lib/engagement";

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
async function signal(itemId: string, action: "save" | "unsave" | "hide") {
  await fetch("/api/signal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemId, action }),
  });
}

const SPRING = "cubic-bezier(0.34, 1.56, 0.64, 1)"; // overshoot → springy pop

function reduceMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}
function haptic(pattern: number | number[]) {
  if (typeof navigator !== "undefined") navigator.vibrate?.(pattern);
}

/** Springy press-pop on the icon. */
function pop(el: Element | null) {
  if (!el || reduceMotion()) return;
  el.animate(
    [{ transform: "scale(1)" }, { transform: "scale(1.35)" }, { transform: "scale(1)" }],
    { duration: 360, easing: SPRING }
  );
}

/** Silk threads radiating from a button — the "capture" burst on save. */
function silkBurst(host: HTMLElement | null) {
  if (!host || reduceMotion()) return;
  const N = 9;
  const rect = host.getBoundingClientRect();
  const cx = rect.width / 2;
  const cy = rect.height / 2;
  for (let i = 0; i < N; i++) {
    const ang = (i / N) * Math.PI * 2 + (Math.PI / N) * 0.5;
    const strand = document.createElement("span");
    strand.style.cssText = `position:absolute;left:${cx}px;top:${cy}px;width:2px;height:2px;border-radius:1px;background:#c9a227;pointer-events:none;transform-origin:center;will-change:transform,opacity;`;
    host.appendChild(strand);
    const dist = 16 + Math.random() * 8;
    strand.animate(
      [
        { transform: `rotate(${ang}rad) scaleY(1) translateY(0)`, opacity: 0.95 },
        {
          transform: `rotate(${ang}rad) scaleY(9) translateY(-${dist}px)`,
          opacity: 0,
        },
      ],
      { duration: 420, easing: "cubic-bezier(0.22, 0.61, 0.36, 1)" }
    ).onfinish = () => strand.remove();
  }
}

/**
 * Snip: the two scissor arms pivot about the rivet (12,12 in the icon's viewBox)
 * and close toward each other twice, like blades cutting a thread. Each arm is a
 * <g> with transform-box:view-box so the rotation origin is in icon coordinates.
 */
function snip(armA: SVGGElement | null, armB: SVGGElement | null) {
  if (reduceMotion()) return;
  const close = 15;
  const opts = { duration: 440, easing: "ease-in-out" } as const;
  armA?.animate(
    [
      { transform: "rotate(0deg)" },
      { transform: `rotate(-${close}deg)` },
      { transform: "rotate(0deg)" },
      { transform: `rotate(-${close}deg)` },
      { transform: "rotate(0deg)" },
    ],
    opts
  );
  armB?.animate(
    [
      { transform: "rotate(0deg)" },
      { transform: `rotate(${close}deg)` },
      { transform: "rotate(0deg)" },
      { transform: `rotate(${close}deg)` },
      { transform: "rotate(0deg)" },
    ],
    opts
  );
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
  const [liked, setLiked] = useState(initialLiked);
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
    setLiked(next);
    pop(saveIcon.current);
    if (next) {
      silkBurst(saveRef.current);
      haptic(18);
      logEngagement(itemId, "save");
      signal(itemId, "save").catch(() => {});
    } else {
      haptic(8);
      signal(itemId, "unsave").catch(() => {});
    }
  }

  // Hide IS terminal — collapse the tile (after the snip plays).
  function onHide() {
    if (hiding) return;
    setHiding(true);
    snip(hideArmA.current, hideArmB.current);
    haptic([8, 30, 8]);
    logEngagement(itemId, "dismiss");
    signal(itemId, "hide").catch(() => {});
    const d = reduceMotion() ? 0 : 340;
    if (d === 0) onResolved?.(itemId);
    else setTimeout(() => onResolved?.(itemId), d);
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
