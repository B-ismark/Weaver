"use client";

import type Lenis from "lenis";

/**
 * Shared handle to the app-wide Lenis instance (created in SmoothScroll). Lets
 * scroll-driven UI (e.g. the back-to-top button) drive the SAME scroll timeline
 * instead of fighting it with a raw window.scrollTo. Null under reduced-motion /
 * before mount, so callers fall back to native scrolling.
 */
let instance: Lenis | null = null;

export function setLenis(l: Lenis | null) {
  instance = l;
}

export function scrollToTop() {
  if (instance) {
    instance.scrollTo(0);
  } else if (typeof window !== "undefined") {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}
