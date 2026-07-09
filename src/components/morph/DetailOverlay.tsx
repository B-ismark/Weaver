"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { Lightbox } from "../Lightbox";
import { beginCloseMorph, closeMorph, readMorph, useMorphState } from "./morphStore";

/**
 * The single, always-mounted host for the detail overlay. It reads the morph store
 * reactively and renders the <Lightbox/> whenever an item is open (or closing) —
 * so opening is instant (no route, no fetch) and drilling into a related tile just
 * re-reads the store.
 *
 * It also keeps the URL honest without handing the overlay to the Next router
 * (which would refetch + unmount the feed underneath):
 *   - Fresh open  → history.pushState('/item/<id>')  (one entry).
 *   - Drill       → history.replaceState('/item/<id>') (same entry).
 *   - Browser Back / a real Next navigation → close the overlay.
 * A hard load / refresh / shared link of /item/<id> still renders the standalone
 * page (the intercept overlay path is gone).
 */
export function DetailOverlay() {
  const state = useMorphState();
  const pathname = usePathname();

  // Reverse-then-clear. The Lightbox animates the hero home on `closing`, then
  // calls onClosed → we clear the store and pop our history entry.
  const requestClose = useCallback(() => beginCloseMorph(), []);
  const onClosed = useCallback(() => {
    const hadEntry = typeof window !== "undefined" && window.history.state?.weaverOverlay;
    closeMorph();
    if (hadEntry) window.history.back();
  }, []);

  // A real Next navigation (Link click) changes the router pathname → close. Our
  // own pushState does NOT touch the Next router, so opening never trips this.
  const firstPath = useRef(true);
  useEffect(() => {
    if (firstPath.current) {
      firstPath.current = false;
      return;
    }
    closeMorph();
  }, [pathname]);

  // Browser Back/Forward → close (no reverse animation; the gesture is abrupt).
  useEffect(() => {
    const onPop = () => {
      if (readMorph()) closeMorph();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // URL sync: push on a fresh open, replace on a drill (so Back always closes to
  // the feed, never walks a drill chain).
  const prevSeq = useRef<number | null>(null);
  useEffect(() => {
    if (!state) {
      prevSeq.current = null;
      return;
    }
    if (typeof window === "undefined") return;
    const url = `/item/${state.item.id}`;
    const base = (window.history.state ?? {}) as Record<string, unknown>;
    if (prevSeq.current == null) {
      window.history.pushState({ ...base, weaverOverlay: true }, "", url);
    } else if (prevSeq.current !== state.seq) {
      window.history.replaceState({ ...base, weaverOverlay: true }, "", url);
    }
    prevSeq.current = state.seq;
  }, [state]);

  if (!state) return null;

  return (
    <Lightbox
      item={state.item}
      rect={state.rect}
      phase={state.phase}
      seq={state.seq}
      onRequestClose={requestClose}
      onClosed={onClosed}
    />
  );
}
