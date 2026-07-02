"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import { setLenis } from "@/lib/lenis";

/**
 * App-wide smooth scrolling (Lenis). A long discovery feed glides instead of
 * stepping, which also gives us a single high-quality scroll timeline to hang
 * scroll-linked effects off later.
 *
 * Side-effect only — renders nothing. Guards:
 *  - Skipped entirely under prefers-reduced-motion (native scroll restored).
 *  - Skipped on touch/coarse-pointer devices (phones, tablets): native momentum
 *    scrolling is already smoother than any JS rAF loop, and Lenis' perpetual
 *    requestAnimationFrame did nothing there but cost frames/battery. Desktop
 *    (fine pointer) still gets smoothed wheel + programmatic scroll.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    if (window.matchMedia?.("(pointer: coarse)").matches) return;

    const lenis = new Lenis({
      duration: 1.05,
      easing: (t) => 1 - Math.pow(1 - t, 3), // easeOutCubic
      smoothWheel: true,
    });
    setLenis(lenis);

    let raf = 0;
    const loop = (time: number) => {
      lenis.raf(time);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      setLenis(null);
      lenis.destroy();
    };
  }, []);

  return null;
}
