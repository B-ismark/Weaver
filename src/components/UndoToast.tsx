"use client";

import { AnimatePresence, m } from "motion/react";
import { useUndo, runUndo, dismissUndo } from "@/lib/undoStore";

/**
 * Session-wide "Undo" bar. Subscribes to the single-slot undo store and shows a
 * dismissible bottom-centre toast whenever a reversible action is pending
 * (currently "Not my taste"). One toast at a time; auto-dismisses via the store's
 * TTL. Sits above the detail overlay (z-70) so a hide performed inside the modal
 * is still undoable. Reduced-motion is handled by MotionConfig (transforms drop,
 * opacity remains).
 */
export function UndoToast() {
  const entry = useUndo();

  return (
    <AnimatePresence>
      {entry && (
        <m.div
          key={entry.id}
          role="status"
          aria-live="polite"
          className="fixed inset-x-0 bottom-4 z-[70] flex justify-center px-4"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ type: "spring", stiffness: 320, damping: 30 }}
        >
          <div className="pointer-events-auto flex items-center gap-4 rounded-full border border-surface bg-background/95 py-2 pl-5 pr-2 text-sm shadow-xl backdrop-blur">
            <span className="text-foreground">{entry.label}</span>
            {/* Undo only for reversible actions (hide); a nudge confirmation has
                no `undo` and just auto-dismisses. */}
            {entry.undo && (
              <button
                type="button"
                onClick={runUndo}
                className="rounded-full bg-accent/15 px-4 py-1.5 font-medium text-accent transition-colors hover:bg-accent/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Undo
              </button>
            )}
            <button
              type="button"
              onClick={dismissUndo}
              aria-label="Dismiss"
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
