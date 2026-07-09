"use client";

import { useEffect, useRef } from "react";
import { logEngagement } from "@/lib/engagement";
import { useLiked, setLiked } from "@/lib/likedStore";
import { hideItem, unhideItem } from "@/lib/hiddenStore";
import { sendSignal } from "@/lib/signals";
import { showUndo } from "@/lib/undoStore";

/**
 * The four taste actions as a row anchored at the BOTTOM of a feed tile — the
 * Pinterest-style press-and-release picker (replaces the old floating portal
 * menu + the separate hover heart).
 *
 * Two input models, one bar:
 *   - Touch (`dragging`): the parent tile detects a long-press, opens the bar and
 *     captures the pointer. As the finger slides across the icons the nearest one
 *     highlights (with a haptic tick); whichever is highlighted when the finger
 *     lifts (parent bumps `commitSeq`) is the chosen action. Lift off the icons →
 *     nothing fires. A deliberate hold-then-release, never a stray tap — this is
 *     what stops accidental picks.
 *   - Pointer (mouse/pen): the bar reveals on hover/focus (hover-capable devices
 *     only, so a phone tap can't leave it stuck) and each icon is a plain button.
 *
 * The drag highlight is applied IMPERATIVELY (a window pointermove subscription
 * updating a ref + the icons' classes directly) so a finger drag never triggers a
 * React re-render of the tile — important on a wall of hundreds.
 *
 * "Not my taste" is reversible: it hides the tile (reactively, via hiddenStore →
 * the grid reflows) and raises an Undo toast that un-hides + re-signals.
 */
type ActionKey = "like" | "more" | "less" | "hide";

const VBAND = 72; // vertical slack (px) above/below the bar that still counts as "on" it

export function TileActionBar({
  itemId,
  caption,
  initialLiked = false,
  open,
  dragging,
  commitSeq,
  onClose,
}: {
  itemId: string;
  caption?: string;
  initialLiked?: boolean;
  open: boolean;
  dragging: boolean;
  commitSeq: number;
  onClose: () => void;
}) {
  const liked = useLiked(itemId, initialLiked);
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const labelRef = useRef<HTMLSpanElement>(null);
  const hiRef = useRef<number | null>(null);
  const firstCommit = useRef(true);

  const actions: { key: ActionKey; label: string; icon: React.ReactNode }[] = [
    {
      key: "like",
      label: liked ? "Liked" : "Like",
      icon: (
        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
      ),
    },
    { key: "more", label: "More like this", icon: <path d="M12 5v14M5 12h14" /> },
    { key: "less", label: "Less like this", icon: <path d="M5 12h14" /> },
    {
      key: "hide",
      label: "Not my taste",
      icon: (
        <>
          <circle cx="6" cy="6" r="3" />
          <circle cx="6" cy="18" r="3" />
          <line x1="20" y1="4" x2="8.12" y2="15.88" />
          <line x1="14.47" y1="14.48" x2="20" y2="20" />
          <line x1="8.12" y1="8.12" x2="12" y2="12" />
        </>
      ),
    },
  ];

  function run(key: ActionKey) {
    switch (key) {
      case "like": {
        const next = !liked;
        setLiked(itemId, next);
        navigator.vibrate?.(next ? 16 : 8);
        if (next) logEngagement(itemId, "save");
        sendSignal(itemId, next ? "save" : "unsave").catch(() => {});
        break;
      }
      case "more":
        navigator.vibrate?.(10);
        sendSignal(itemId, "more").catch(() => {});
        break;
      case "less":
        navigator.vibrate?.(10);
        sendSignal(itemId, "less").catch(() => {});
        break;
      case "hide": {
        // Reactive collapse: hiddenStore drives every mounted grid to reflow the
        // tile out. NOT onResolved (which is permanent) — so Undo can restore it.
        hideItem(itemId);
        navigator.vibrate?.([8, 24, 8]);
        logEngagement(itemId, "dismiss");
        sendSignal(itemId, "hide").catch(() => {});
        showUndo({
          id: itemId,
          label: caption ? `Hid “${trim(caption)}”` : "Removed from your feed",
          undo: () => {
            unhideItem(itemId);
            sendSignal(itemId, "unhide").catch(() => {});
          },
        });
        break;
      }
    }
  }

  // Paint the highlight imperatively (no React state → no re-render per move).
  function paint(active: number | null) {
    btnRefs.current.forEach((el, i) => {
      if (!el) return;
      const on = i === active;
      el.classList.toggle("scale-125", on);
      el.classList.toggle("ring-2", on);
      el.classList.toggle("ring-accent", on);
    });
    const label = labelRef.current;
    if (label) {
      if (active == null) {
        label.style.opacity = "0";
      } else {
        label.textContent = actions[active].label;
        label.style.opacity = "1";
      }
    }
  }

  function nearest(x: number, y: number): number | null {
    let best: number | null = null;
    let bestDx = Infinity;
    btnRefs.current.forEach((el, i) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (y < r.top - VBAND || y > r.bottom + VBAND) return;
      const cx = r.left + r.width / 2;
      const dx = Math.abs(x - cx);
      if (dx < bestDx) {
        bestDx = dx;
        best = i;
      }
    });
    return best;
  }

  // Touch drag: follow the finger via a window listener (events still bubble to
  // window despite the tile's pointer capture) and highlight the nearest icon.
  useEffect(() => {
    if (!dragging) return;
    hiRef.current = null;
    paint(null);
    const onMove = (e: PointerEvent) => {
      const best = nearest(e.clientX, e.clientY);
      if (best !== hiRef.current) {
        hiRef.current = best;
        paint(best);
        if (best != null) navigator.vibrate?.(5);
      }
    };
    window.addEventListener("pointermove", onMove);
    return () => {
      window.removeEventListener("pointermove", onMove);
      hiRef.current = null;
      paint(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  // Release: commit whatever was highlighted, then close. Skips the initial mount.
  useEffect(() => {
    if (firstCommit.current) {
      firstCommit.current = false;
      return;
    }
    const i = hiRef.current;
    if (i != null) run(actions[i].key);
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commitSeq]);

  return (
    <div
      className={`absolute inset-x-0 bottom-0 z-30 flex flex-col items-center gap-2 px-2 pb-2 pt-8 transition-opacity duration-200 ${
        open ? "opacity-100" : "pointer-events-none opacity-0"
      } [@media(hover:hover)]:group-hover:pointer-events-auto [@media(hover:hover)]:group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100`}
      style={{ background: "linear-gradient(to top, rgba(0,0,0,0.72), transparent)" }}
    >
      {/* Floating label of the icon the finger is over (touch drag affordance).
          Content + visibility are set imperatively by paint() during a drag. */}
      <span
        ref={labelRef}
        aria-hidden="true"
        className="pointer-events-none rounded-full bg-background/95 px-3 py-1 text-xs font-medium text-foreground opacity-0 shadow-md backdrop-blur transition-opacity duration-100"
      />

      <div role="group" aria-label="Tile actions" className="flex items-center justify-center gap-2">
        {actions.map((a, i) => {
          const isLike = a.key === "like";
          return (
            <button
              key={a.key}
              ref={(el) => {
                btnRefs.current[i] = el;
              }}
              type="button"
              aria-label={a.label}
              aria-pressed={isLike ? liked : undefined}
              // Pointer (mouse/pen) path: a normal click. On touch, the parent
              // preventDefaults the synthetic click, so this never double-fires.
              onClick={() => {
                run(a.key);
                onClose();
              }}
              className={`flex items-center justify-center rounded-full bg-background/90 p-2.5 text-foreground shadow-sm backdrop-blur transition-transform duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                isLike && liked ? "text-accent" : ""
              }`}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill={isLike && liked ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {a.icon}
              </svg>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function trim(s: string, n = 24): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
