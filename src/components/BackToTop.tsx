"use client";

import { useEffect, useRef, useState } from "react";
import { scrollToTop } from "@/lib/lenis";

/**
 * Floating "back to top" control. On a long discovery feed you often want to jump
 * back up after diving deep — but a persistent button clutters the wall. So it
 * only reveals once you've scrolled well down AND begin scrolling back UP (the
 * moment you're heading toward the top), then hides again the instant you resume
 * scrolling down or reach the top. Tapping it glides to the top on the shared
 * Lenis timeline (native smooth as a fallback).
 *
 * a11y: a real button with a label; the reveal is a simple fade so it's calm
 * under prefers-reduced-motion (motion is opacity-only, no travel).
 */
const REVEAL_AFTER = 600; // px scrolled before the button is eligible to show

export function BackToTop() {
  const [visible, setVisible] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    lastY.current = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const scrollingUp = y < lastY.current;
      // Show only when we're deep enough AND moving toward the top.
      setVisible(y > REVEAL_AFTER && scrollingUp);
      lastY.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Back to top"
      title="Back to top"
      tabIndex={visible ? 0 : -1}
      className={`fixed bottom-6 right-6 z-40 flex size-12 items-center justify-center rounded-full border border-surface bg-background/90 text-foreground shadow-lg backdrop-blur transition-[opacity,transform] duration-300 hover:-translate-y-0.5 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 ${
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
      }`}
      style={{
        // Sit above the iOS home-indicator / notch on mobile PWAs.
        bottom: "max(1.5rem, env(safe-area-inset-bottom))",
        right: "max(1.5rem, env(safe-area-inset-right))",
      }}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m18 15-6-6-6 6" />
      </svg>
    </button>
  );
}
