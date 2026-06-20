"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Search bar (§2). Submits to /search?q=… as a GET navigation so results are
 * server-rendered and shareable/bookmarkable. Accessible: labelled search role.
 */
export function SearchBar({ initial = "" }: { initial?: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const term = q.trim();
        if (term) router.push(`/search?q=${encodeURIComponent(term)}`);
      }}
      className="w-full max-w-md"
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
        placeholder="Search — e.g. minimalist photography"
        className="w-full rounded-full border border-surface bg-surface px-4 py-2 text-sm outline-none focus-visible:border-ring"
      />
    </form>
  );
}
