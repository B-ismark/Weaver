"use client";

import { m } from "motion/react";

/**
 * Fade + lift a block of content in on mount. Uses the lightweight `m.div`
 * (required under LazyMotion strict, see MotionProvider) and inherits
 * reduced-motion handling from MotionConfig — under reduced motion the lift is
 * dropped and only the opacity settles.
 *
 * Animates on mount (not whileInView) so above-the-fold content can never get
 * stuck at opacity 0 if the in-view feature isn't loaded. Reach for this on
 * editorial content (headings, empty states, detail sidebars), NOT on feed
 * tiles — those weave in via CSS + AutoAnimate to avoid per-tile JS.
 */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <m.div
      className={className}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.22, 0.61, 0.36, 1] }}
    >
      {children}
    </m.div>
  );
}
