"use client";

import { logEngagement } from "@/lib/engagement";
import { useIsOwner } from "./OwnerProvider";

/**
 * Source-out link (§2): follows to the original post on the source platform and
 * logs it as a strong positive signal (a click-through to source ≈ "save", §12).
 *
 * The link itself is public (visitors can follow to the source), but the taste
 * signal is only logged for the owner — a visitor's click must not shape the feed
 * (and /api/events is owner-gated at the proxy anyway).
 */
export function SourceOutLink({
  itemId,
  href,
  platform,
}: {
  itemId: string;
  href: string;
  platform: string;
}) {
  const owner = useIsOwner();
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={owner ? () => logEngagement(itemId, "save") : undefined}
      className="inline-flex items-center gap-2 self-start rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background"
    >
      <span className="capitalize">Open on {platform}</span>
      <span aria-hidden="true">↗</span>
    </a>
  );
}
