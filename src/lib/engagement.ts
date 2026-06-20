/**
 * Engagement event logging (§7, §12 — instrumented from Phase 0).
 *
 * These per-item events (save / click / dwell / dismiss / impression) are the
 * training data for the parked learned ranker (§13). They cannot be recovered
 * retroactively, so we capture them now even though nothing consumes them yet.
 */

export type EngagementType =
  | "impression" // item entered the viewport
  | "click" // opened detail / followed source-out
  | "save" // explicit positive signal in-app
  | "dwell" // spent meaningful time on detail
  | "dismiss"; // hid / scrolled past quickly

export interface EngagementEvent {
  itemId: string;
  type: EngagementType;
  /** Optional magnitude, e.g. dwell milliseconds. */
  value?: number;
  /** Client timestamp (ISO). Server may override with authoritative time. */
  ts: string;
}

/**
 * Fire-and-forget logger. Uses sendBeacon when available so events survive
 * navigation/unload without blocking the UI (efficiency). Never throws.
 */
export function logEngagement(
  itemId: string,
  type: EngagementType,
  value?: number
): void {
  if (typeof window === "undefined") return;
  const event: EngagementEvent = { itemId, type, value, ts: new Date().toISOString() };
  const body = JSON.stringify(event);

  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/events", new Blob([body], { type: "application/json" }));
    } else {
      void fetch("/api/events", { method: "POST", body, keepalive: true });
    }
  } catch {
    // Logging must never break the feed.
  }
}
