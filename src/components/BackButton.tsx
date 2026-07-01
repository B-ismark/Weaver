"use client";

import { useRouter } from "next/navigation";

/**
 * Dismiss the current detail view and return to wherever the user came from,
 * WITHOUT re-fetching. router.back() restores the cached feed and scroll
 * position, so the feed doesn't reshuffle (clicking the wordmark, by contrast,
 * is a fresh navigation to the home feed). Falls back to the home feed when
 * there's no in-app history (e.g. the user opened the link directly).
 */
export function BackButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push("/");
      }}
      className="flex shrink-0 items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md px-1"
      aria-label="Back to feed"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m15 18-6-6 6-6" />
      </svg>
      Back
    </button>
  );
}
