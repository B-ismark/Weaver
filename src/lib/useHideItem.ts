"use client";

import { useCallback } from "react";
import { hideItem } from "./hiddenStore";
import { sendSignal } from "./signals";
import { logEngagement } from "./engagement";

/**
 * The one "not my taste" action, shared by the overlay button and the long-press
 * menu. It removes ONLY the tapped tile and remembers it:
 *   1. adds the id to the session hidden store (so the tile stays gone across
 *      client navigation — see hiddenStore); the grid reflows around the gap,
 *   2. logs the dismiss + POSTs the hide signal so the server suppresses it (and
 *      things like it) on the next fetch.
 *
 * It deliberately does NOT reorder or re-fetch the rest of the feed — hiding one
 * card shouldn't disturb the others. The caller owns the collapse animation.
 */
export function useHideItem() {
  return useCallback((itemId: string) => {
    hideItem(itemId);
    logEngagement(itemId, "dismiss");
    sendSignal(itemId, "hide").catch(() => {});
  }, []);
}
