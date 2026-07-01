"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/**
 * Search bar (§2). Submits to /search?q=… as a GET navigation so results are
 * server-rendered and shareable. Embedding the query (CLIP text tower, possible
 * cold start) is slow, so we surface pending state immediately via useTransition
 * and a spinner — the navigation also streams /search/loading.tsx.
 */
export function SearchBar({ initial = "" }: { initial?: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);
  const [pending, startTransition] = useTransition();

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const term = q.trim();
        if (term) startTransition(() => router.push(`/search?q=${encodeURIComponent(term)}`));
      }}
      className="relative w-full max-w-md"
    >
      <label htmlFor="q" className="sr-only">
        Search your images
      </label>
      <input
        id="q"
        name="q"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search, e.g. minimalist photography"
        className="w-full rounded-full border border-surface bg-surface px-4 py-2 pr-10 text-sm outline-none focus-visible:border-ring"
      />
      {pending && (
        <span
          aria-label="Searching"
          role="status"
          className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin rounded-full border-2 border-muted border-t-transparent"
        />
      )}
    </form>
  );
}
