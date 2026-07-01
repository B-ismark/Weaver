"use client";

import { useState } from "react";

/**
 * Soft taste steering on the detail view — "More like this" / "Less like this".
 *
 * A middle ground between Like (promotes to the taste set + drops the tile) and
 * Not-my-taste (hides it + suppresses everything similar): these just nudge the
 * nearest taste centroid a small step toward / away from this image. Nothing is
 * added, removed, or hidden — so it's a low-stakes way to shape the feed while
 * browsing. Lives on the detail page (deliberate exploration) to keep feed tiles
 * uncluttered.
 *
 * Accessibility: real buttons, aria-pressed reflects the last choice, a polite
 * live region confirms the nudge. No motion beyond the built-in active:scale.
 */
async function signal(itemId: string, action: "more" | "less") {
  await fetch("/api/signal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemId, action }),
  });
}

export function TasteNudge({ itemId }: { itemId: string }) {
  const [choice, setChoice] = useState<"" | "more" | "less">("");
  const [status, setStatus] = useState("");

  function nudge(action: "more" | "less") {
    setChoice(action);
    setStatus(action === "more" ? "Tuned toward this style" : "Tuned away from this style");
    signal(itemId, action).catch(() => {});
  }

  const btn =
    "flex-1 rounded-full border px-3 py-2 text-sm font-medium transition-[transform,background-color,border-color] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70";

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs uppercase tracking-wide text-muted">Tune your feed</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => nudge("more")}
          aria-pressed={choice === "more"}
          className={`${btn} ${
            choice === "more"
              ? "border-accent bg-accent/15 text-accent"
              : "border-surface bg-surface hover:bg-background"
          }`}
        >
          More like this
        </button>
        <button
          type="button"
          onClick={() => nudge("less")}
          aria-pressed={choice === "less"}
          className={`${btn} ${
            choice === "less"
              ? "border-surface bg-background text-muted"
              : "border-surface bg-surface hover:bg-background"
          }`}
        >
          Less like this
        </button>
      </div>
      <output aria-live="polite" className="min-h-4 text-xs text-muted">
        {status}
      </output>
    </div>
  );
}
