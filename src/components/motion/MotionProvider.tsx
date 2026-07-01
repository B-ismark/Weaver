"use client";

import { LazyMotion, domAnimation, MotionConfig } from "motion/react";

/**
 * App-wide Motion context, kept deliberately small:
 *  - `LazyMotion` + `domAnimation` ships only the DOM animation features (~5–6kb)
 *    instead of the full Motion bundle. `strict` forbids the heavy `motion.*`
 *    components, so we must use the lightweight `m.*` (see Reveal).
 *  - `MotionConfig reducedMotion="user"` makes every Motion animation honour the
 *    OS prefers-reduced-motion setting (transforms drop, opacity is kept).
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={domAnimation} strict>
        {children}
      </LazyMotion>
    </MotionConfig>
  );
}
