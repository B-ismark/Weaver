"use client";

/**
 * Explicit feedback on a feed item → POST /api/signal (discovery spec §9).
 * One definition, shared by every surface that steers taste (ItemActions,
 * TasteNudge, the tile long-press menu) so the request shape stays in one place.
 *
 *   save/unsave : promote/demote to the taste set (strong).
 *   hide/unhide : "not my taste" — suppress it and everything like it.
 *   more/less   : soft nudge of the nearest centroid, no add/remove/hide.
 *
 * Fire-and-forget by design; callers .catch() to keep the UI unbreakable. Returns
 * the promise so a caller CAN await it (e.g. refresh the feed once it commits).
 */
export type SignalAction = "save" | "unsave" | "hide" | "unhide" | "more" | "less";

export function sendSignal(itemId: string, action: SignalAction): Promise<Response> {
  return fetch("/api/signal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemId, action }),
  });
}
