"use client";

import Image from "next/image";
import { m } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FeedItem } from "@/lib/feed";
import { shouldOptimize } from "@/lib/imageHost";
import { MasonryFeed } from "./MasonryFeed";
import { SkeletonFeed } from "./SkeletonFeed";
import { SourceOutLink } from "./SourceOutLink";
import { ItemActions } from "./ItemActions";
import { TasteNudge } from "./TasteNudge";

/**
 * The enlarged detail view, rendered as a CLIENT overlay by <DetailOverlay/> (which
 * owns the morph store + URL). Presentational + self-animating: it receives the
 * item, the source-tile rect, the phase, and a `seq` that bumps on every open/drill.
 *
 * Instant by construction: the tapped tile already carries everything the hero
 * needs (fullUrl/thumbUrl/dims/caption), so the overlay opens and the hero FLIPs
 * the SAME frame as the tap — no route fetch gates it. "More like this" streams in
 * afterwards via /api/similar behind a skeleton.
 *
 * Morph — a controlled FLIP: the hero renders at its final (target) box and a
 * transform animates it FROM the source rect on open, and back to the tile's LIVE
 * rect on close. Keying the hero on `seq` means a drill (tapping a related tile)
 * remounts it → it flies up out of the tapped thumbnail. Spring tuned to the brief:
 * ~0.4s response, ~0.8 damping → a soft, tactile overshoot.
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

function flipFrom(origin: Box, target: Box): From {
  return {
    scale: target.width > 0 ? origin.width / target.width : 1,
    x: origin.left + origin.width / 2 - (target.left + target.width / 2),
    y: origin.top + origin.height / 2 - (target.top + target.height / 2),
  };
}

/** The source tile's CURRENT rect (feed stays mounted underneath). */
function liveTileRect(id: string): Box | null {
  const sel = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id;
  const el = document.querySelector(`[data-morph-id="${sel}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

/**
 * "More like this", client-fetched. Mounted fresh per item (keyed by the caller),
 * so its loading state resets on a drill without any reset-in-effect.
 */
function RelatedGrid({ itemId }: { itemId: string }) {
  const [items, setItems] = useState<FeedItem[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/similar?id=${encodeURIComponent(itemId)}`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d: { items?: FeedItem[] }) => {
        if (!cancelled) setItems(d.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [itemId]);

  return (
    <section className="mt-10" aria-labelledby="lb-more-like-this">
      <div className="mb-5 flex items-center gap-3">
        <h2 id="lb-more-like-this" className="font-display text-lg font-semibold tracking-tight">
          Threads from this
        </h2>
        <span aria-hidden="true" className="h-px flex-1 bg-accent/40" />
      </div>
      {items === null ? (
        <SkeletonFeed count={6} />
      ) : items.length > 0 ? (
        // Tapping a related tile drills the overlay into it (morph=false = no
        // neighbour reflow inside the overlay).
        <MasonryFeed items={items} morph={false} />
      ) : (
        <p className="text-sm text-muted">No threads yet.</p>
      )}
    </section>
  );
}

/** Keyed per item so the thumb→full crossfade resets on each open/drill. */
function HeroImage({ item }: { item: FeedItem }) {
  const [fullLoaded, setFullLoaded] = useState(false);
  return (
    <>
      {/* Thumb (already grid-decoded) paints instantly — the morph flies with real
          pixels frame 1. Full-res fades in over it once decoded. */}
      <Image
        src={item.thumbUrl}
        alt=""
        fill
        sizes="100vw"
        priority
        unoptimized={!shouldOptimize(item.thumbUrl)}
        className="object-cover"
      />
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
    </>
  );
}

export function Lightbox({
  item,
  rect,
  phase,
  seq,
  onRequestClose,
  onClosed,
}: {
  item: FeedItem;
  rect: DOMRect | null;
  phase: "open" | "closing";
  seq: number;
  onRequestClose: () => void;
  onClosed: () => void;
}) {
  const reduce = reduceMotion();

  // Geometry is stable within a `seq`; a drill bumps seq → fresh FLIP-from.
  const geom = useMemo(() => {
    const target = targetBox(item);
    const from = rect
      ? flipFrom({ left: rect.left, top: rect.top, width: rect.width, height: rect.height }, target)
      : null;
    return { target, from };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq]);
  const { target, from } = geom;

  // Reverse target: fly back to the tile's live position (feed stays mounted). A
  // drilled item usually isn't in the feed → no live tile → shrink-fade instead.
  const out = useMemo(() => {
    if (phase !== "closing") return null;
    const live = liveTileRect(item.id) ?? (rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null);
    return live ? flipFrom(live, target) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, seq]);

  // Lock the background from scrolling while the overlay owns the screen.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Escape reverses; resize closes (its geometry would be stale).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onRequestClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onRequestClose);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onRequestClose);
    };
  }, [onRequestClose]);

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
    phase === "closing"
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
      <m.div
        aria-hidden="true"
        onClick={onRequestClose}
        className="fixed inset-0 bg-black"
        initial={{ opacity: 0 }}
        animate={{ opacity: phase === "closing" ? 0 : BACKDROP }}
        transition={{ duration: reduce ? 0.15 : 0.28, ease: "easeOut" }}
      />

      <button
        ref={closeBtnRef}
        type="button"
        onClick={onRequestClose}
        aria-label="Close"
        className="fixed right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-background/85 text-foreground shadow-lg backdrop-blur transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>

      {/* Hero — keyed on seq so a drill remounts it and flies from the new rect. */}
      <m.div
        key={seq}
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
          if (phase === "closing") onClosed();
        }}
      >
        <HeroImage item={item} />
      </m.div>

      {/* Meta + actions + related. Keyed on item so it re-reveals on a drill. */}
      <m.div
        key={`meta-${item.id}`}
        className="relative z-[1] mx-auto w-full max-w-3xl px-4 pb-16 pt-6"
        initial={{ opacity: 0, y: reduce ? 0 : 10 }}
        animate={{ opacity: phase === "closing" ? 0 : 1, y: 0 }}
        transition={{ duration: 0.3, delay: phase === "closing" ? 0 : 0.12, ease: "easeOut" }}
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

        {/* Threads from this — related grid, keyed per item so it refetches +
            resets its skeleton on a drill. */}
        <RelatedGrid key={item.id} itemId={item.id} />
      </m.div>
    </div>
  );
}
