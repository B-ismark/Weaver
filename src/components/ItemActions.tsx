"use client";

import { useState } from "react";
import { logEngagement } from "@/lib/engagement";

/**
 * Save / Hide / Share actions for a feed item (Pinterest-style). Used as a tile
 * overlay and on the detail view. Optimistic: on save/hide it calls onResolved
 * so the parent can drop the tile from the feed.
 *
 * - Save  → promote to taste (positive). - Hide → "not my taste" (negative).
 * - Share → Web Share API, falling back to copy-link.
 * Accessible: real buttons with aria-labels, keyboard-focusable.
 */
async function signal(itemId: string, action: "save" | "hide") {
  await fetch("/api/signal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemId, action }),
  });
}

export function ItemActions({
  itemId,
  sourceLink,
  caption,
  variant = "overlay",
  onResolved,
}: {
  itemId: string;
  sourceLink: string;
  caption?: string;
  variant?: "overlay" | "bar";
  onResolved?: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [shared, setShared] = useState<"" | "copied">("");

  async function onSave() {
    if (busy) return;
    setBusy(true);
    logEngagement(itemId, "save");
    await signal(itemId, "save").catch(() => {});
    onResolved?.(itemId);
  }
  async function onHide() {
    if (busy) return;
    setBusy(true);
    logEngagement(itemId, "dismiss");
    await signal(itemId, "hide").catch(() => {});
    onResolved?.(itemId);
  }
  async function onShare() {
    const data = { title: caption || "Weaver", url: sourceLink };
    if (navigator.share) {
      navigator.share(data).catch(() => {});
    } else {
      await navigator.clipboard?.writeText(sourceLink).catch(() => {});
      setShared("copied");
      setTimeout(() => setShared(""), 1500);
    }
  }

  const base =
    variant === "overlay"
      ? "rounded-full bg-background/85 p-2 text-foreground shadow-sm backdrop-blur hover:bg-background"
      : "rounded-full border border-surface bg-surface px-3 py-2 text-sm hover:bg-background";

  return (
    <div
      className={
        variant === "overlay"
          ? "flex gap-1.5"
          : "flex flex-wrap gap-2"
      }
    >
      <button type="button" onClick={onSave} disabled={busy} aria-label="Save — more like this" className={base} title="Save">
        {variant === "bar" ? "♥ Save" : "♥"}
      </button>
      <button type="button" onClick={onHide} disabled={busy} aria-label="Hide — not my taste" className={base} title="Not my taste">
        {variant === "bar" ? "⊘ Not my taste" : "⊘"}
      </button>
      <button type="button" onClick={onShare} aria-label="Share" className={base} title="Share">
        {variant === "bar" ? (shared === "copied" ? "✓ Link copied" : "↗ Share") : "↗"}
      </button>
    </div>
  );
}
