"use client";

/**
 * Scroll helpers. Native only — no smooth-scroll library.
 *
 * A JS-driven "smooth scroll" (Lenis) used to run a perpetual requestAnimationFrame
 * loop hijacking the wheel. It cost frames + battery, fought the browser's own
 * scroll restoration on back/forward, and never even ran on touch devices (native
 * momentum is already smoother). Removed: native scrolling is smooth, and it lets
 * the feed restore scroll position on back navigation cleanly.
 */
export function scrollToTop() {
  if (typeof window === "undefined") return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
}
