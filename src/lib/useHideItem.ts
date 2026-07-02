"use client";

import { usePathname } from "next/navigation";
import { useCallback } from "react";
import { hideItem } from "./hiddenStore";
import { sendSignal } from "./signals";
import { logEngagement } from "./engagement";
import { requestFeedRefresh } from "./feedRefresh";

/**
 * The one "not my taste" action, shared by the overlay button and the long-press
 * menu. It:
 *   1. adds the id to the session hidden store (so the tile stays gone across
 *      client navigation — see hiddenStore),
 *   2. logs the dismiss + POSTs the hide signal, and
 *   3. on the HOME feed, reshuffles the already-loaded cards (requestFeedRefresh)
 *      so the wall doesn't look stale after a card vanishes — no re-fetch, no
 *      scroll jump. The reshuffle also drops any cards liked this session.
 *
 * The caller still owns the tile-collapse animation / onResolved timing.
 */
export function useHideItem() {
  const pathname = usePathname();

  return useCallback(
    (itemId: string) => {
      hideItem(itemId);
      logEngagement(itemId, "dismiss");
      sendSignal(itemId, "hide").catch(() => {});
      if (pathname === "/") requestFeedRefresh();
    },
    [pathname]
  );
}
