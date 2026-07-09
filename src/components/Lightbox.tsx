"use client";

import Image from "next/image";
import { m } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { FeedItem } from "@/lib/feed";
import { shouldOptimize } from "@/lib/imageHost";
import { readMorph, beginCloseMorph, closeMorph } from "./morph/morphStore";
import { SourceOutLink } from "./SourceOutLink";
import { ItemActions } from "./ItemActions";
import { TasteNudge } from "./TasteNudge";

/**
 * The enlarged detail view rendered as an OVERLAY (the `@modal` slot), on top of
 * the still-mounted feed. This is what makes the Pinterest-style opening possible:
 * because the grid underneath never unmounts, the hero can FLIP out of the tapped
 * tile and the neighbouring tiles can be pushed aside (see MorphContext + PinCard).
 *
 * Morph technique — a CONTROLLED FLIP, not Motion's `layoutId`:
 *   `layoutId` is the textbook tool for a thumbnail→fullscreen morph, but across
 *   a Next parallel-route boundary the *close* is fragile — the router unmounts
 *   this slot before Motion can play the reverse. So we drive it ourselves: the
 *   hero renders at its final (target) box and we animate a transform FROM the
 *   source tile's rect TO identity on open, and back to the tile's LIVE rect on
 *   close. Deterministic in both directions, full spring control, and it only
 *   needs transforms (so the app keeps Motion's lean `domAnimation` bundle).
 *
 * The spring is tuned to the brief: ~0.4s response, ~0.8 damping → a soft,
 * tactile overshoot as the image settles at full size.
 */
const SPRING = { type: "spring", stiffness: 210, damping: 26 } as const;
const BACKDROP = 0.82;
const MARGIN_TOP = 48;

function reduceMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

type Box = { left: number; top: number; width: number; height: number };
type From = { x: number; y: number; scale: number };

/** The hero's on-screen box (contain-fit, centred, pinned near the top). */
function targetBox(item: FeedItem): Box {
  if (typeof document === "undefined") return { left: 0, top: 0, width: 0, height: 0 };
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const padX = Math.max(16, Math.min(56, vw * 0.05));
  const availW = vw - padX * 2;
  const availH = vh - MARGIN_TOP - 56;
  const ar = item.width > 0 && item.height > 0 ? item.width / item.height : 0.8;
  let width = availW;
  let height = width / ar;
  if (height > availH) {
    height = availH;
    width = height * ar;
  }
  return { left: (vw - width) / 2, top: MARGIN_TOP, width, height };
}

/** The transform that places the hero exactly over `origin` (the tile rect). */
function flipFrom(origin: Box, target: Box): From {
  return {
    scale: origin.width / target.width,
    x: origin.left + origin.width / 2 - (target.left + target.width / 2),
    y: origin.top + origin.height / 2 - (target.top + target.height / 2),
  };
}

/** The open geometry: the hero's target box + the transform that starts it over
 * the source tile (null on a deep link, where there's no tile to fly from). */
function computeGeom(item: FeedItem, src: { id: string; rect: DOMRect } | null) {
  const target = targetBox(item);
  const origin = src && src.id === item.id ? src.rect : null;
  return {
    target,
    from: origin
      ? flipFrom(
          { left: origin.left, top: origin.top, width: origin.width, height: origin.height },
          target
        )
      : null,
  };
}

/** The source tile's CURRENT rect (it stays mounted underneath, just hidden). */
function liveTileRect(id: string): Box | null {
  const sel = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id;
  const el = document.querySelector(`[data-morph-id="${sel}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

export function Lightbox({ item, similar }: { item: FeedItem; similar?: React.ReactNode }) {
  const router = useRouter();
  const reduce = reduceMotion();

  // Capture the morph source ONCE, on mount. On a soft navigation the tapped tile
  // has already published its rect; on a hard load (deep link) there's no source
  // → we fall back to a gentle scale-in instead of a FLIP. Computed via a lazy
  // useState initialiser (not a ref) so it's read-safe during render. This overlay
  // only ever renders client-side (the intercepted @modal slot), so `document` is
  // always available here.
  const [geom] = useState(() => computeGeom(item, readMorph()));
  const { target, from } = geom;

  // Drive open → closing as a tiny state machine. `out` holds the reverse target,
  // computed against the tile's live position at the moment the user closes.
  const [phase, setPhase] = useState<"in" | "out">("in");
  const [out, setOut] = useState<From | null>(null);
  const [fullLoaded, setFullLoaded] = useState(false);
  const closingRef = useRef(false);

  const startClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    beginCloseMorph(); // neighbours settle back now; source tile stays hidden
    const live = liveTileRect(item.id);
    setOut(live ? flipFrom(live, target) : from);
    setPhase("out");
  }, [item.id, target, from]);

  const finishClose = useCallback(() => {
    closeMorph(); // reveal the source tile exactly where the hero landed
    router.back();
  }, [router]);

  // Lock the background from scrolling while the overlay owns the screen.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Escape closes with the reverse morph; resize closes instantly (its geometry
  // would be stale — matching the tile menu's dismiss-on-resize behaviour).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") startClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", startClose);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", startClose);
    };
  }, [startClose]);

  // Safety net: if this slot unmounts by any path we didn't drive (hardware Back,
  // forward nav), still clear the morph so the source tile is revealed rather than
  // left permanently hidden.
  useEffect(() => {
    return () => closeMorph();
  }, []);

  const closeBtnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeBtnRef.current?.focus();
  }, []);

  const heroInitial = reduce
    ? { opacity: 0 }
    : from
      ? { x: from.x, y: from.y, scale: from.scale, borderRadius: 14 }
      : { opacity: 0, scale: 0.96, borderRadius: 14 };

  const heroAnimate =
    phase === "out"
      ? reduce
        ? { opacity: 0 }
        : out
          ? { x: out.x, y: out.y, scale: out.scale, borderRadius: 14, opacity: 1 }
          : { opacity: 0, scale: 0.96 }
      : reduce
        ? { opacity: 1 }
        : { x: 0, y: 0, scale: 1, borderRadius: 10, opacity: 1 };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={item.caption || "Image detail"}
      className="fixed inset-0 z-[60] overflow-y-auto overscroll-contain"
    >
      {/* Backdrop — dim, not opaque, so the woven wall still reads faintly behind. */}
      <m.div
        aria-hidden="true"
        onClick={startClose}
        className="fixed inset-0 bg-black"
        initial={{ opacity: 0 }}
        animate={{ opacity: phase === "out" ? 0 : BACKDROP }}
        transition={{ duration: reduce ? 0.15 : 0.28, ease: "easeOut" }}
      />

      {/* Close */}
      <button
        ref={closeBtnRef}
        type="button"
        onClick={startClose}
        aria-label="Close"
        className="fixed right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-background/85 text-foreground shadow-lg backdrop-blur transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>

      {/* The morphing hero. Sized to its final box; a transform does the flight. */}
      <m.div
        className="relative z-[1] overflow-hidden bg-surface shadow-2xl"
        style={{
          width: target.width,
          height: target.height,
          marginLeft: "auto",
          marginRight: "auto",
          marginTop: MARGIN_TOP,
          transformOrigin: "center center",
          willChange: "transform",
        }}
        initial={heroInitial}
        animate={heroAnimate}
        transition={reduce ? { duration: 0.2 } : SPRING}
        onAnimationComplete={() => {
          if (phase === "out") finishClose();
        }}
      >
        {/* Thumb-first: the grid already decoded this thumbUrl, so it paints
            INSTANTLY — the hero flies with real pixels from frame 1 instead of a
            blank box while the full-res loads (the mobile feed-tap path). */}
        <Image
          src={item.thumbUrl}
          alt=""
          fill
          sizes="100vw"
          priority
          unoptimized={!shouldOptimize(item.thumbUrl)}
          className="object-cover"
        />
        {/* Full-res fades in over the thumb once decoded — sharpens after the morph. */}
        <Image
          src={item.fullUrl}
          alt={item.caption || "Image"}
          fill
          sizes="100vw"
          priority
          unoptimized={!shouldOptimize(item.fullUrl)}
          onLoad={() => setFullLoaded(true)}
          className={`object-cover transition-opacity duration-300 ${
            fullLoaded ? "opacity-100" : "opacity-0"
          }`}
        />
      </m.div>

      {/* Meta + actions + "more like this" scroll below the hero (Pinterest closeup). */}
      <m.div
        className="relative z-[1] mx-auto w-full max-w-3xl px-4 pb-16 pt-6"
        initial={{ opacity: 0, y: reduce ? 0 : 10 }}
        animate={{ opacity: phase === "out" ? 0 : 1, y: 0 }}
        transition={{ duration: 0.3, delay: phase === "out" ? 0 : 0.12, ease: "easeOut" }}
      >
        <div className="flex flex-col gap-4 rounded-2xl border border-surface bg-background/80 p-5 backdrop-blur">
          {item.caption && (
            <h1 className="font-display text-2xl font-medium leading-snug">{item.caption}</h1>
          )}
          <SourceOutLink itemId={item.id} href={item.sourceLink} platform={item.platform} />
          <ItemActions
            itemId={item.id}
            sourceLink={item.sourceLink}
            caption={item.caption}
            variant="bar"
            initialLiked={item.saved}
          />
          <TasteNudge itemId={item.id} />
        </div>

        {similar}
      </m.div>
    </div>
  );
}
