"use client";

import { logEngagement } from "@/lib/engagement";

/**
 * Source-out link (§2): follows to the original post on the source platform and
 * logs it as a strong positive signal (a click-through to source ≈ "save", §12).
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
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => logEngagement(itemId, "save")}
      className="inline-flex items-center gap-2 self-start rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background"
    >
      <span className="capitalize">Open on {platform}</span>
      <span aria-hidden="true">↗</span>
    </a>
  );
}
