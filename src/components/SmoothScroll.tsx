"use client";

import { useEffect } from "react";
import Lenis from "lenis";

/**
 * App-wide smooth scrolling (Lenis). A long discovery feed glides instead of
 * stepping, which also gives us a single high-quality scroll timeline to hang
 * scroll-linked effects off later.
 *
 * Side-effect only — renders nothing. Guards:
 *  - Skipped entirely under prefers-reduced-motion (native scroll restored).
 *  - Only wheel/programmatic scroll is smoothed; touch stays native, so mobile /
 *    PWA gestures feel normal and momentum isn't fought.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const lenis = new Lenis({
      duration: 1.05,
      easing: (t) => 1 - Math.pow(1 - t, 3), // easeOutCubic
      smoothWheel: true,
    });

    let raf = 0;
    const loop = (time: number) => {
      lenis.raf(time);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
    };
  }, []);

  return null;
}
