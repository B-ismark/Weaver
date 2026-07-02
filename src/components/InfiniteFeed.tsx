"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FeedItem } from "@/lib/feed";
import { MasonryFeed } from "./MasonryFeed";
import { DiscoverButton } from "./DiscoverButton";
import { getLikedIds } from "@/lib/likedStore";

/**
 * Infinite-scroll wrapper around the masonry grid.
 *
 * A discovery feed shouldn't end at 60 tiles — the endless browse loop IS the
 * product. This holds the growing item list, watches a sentinel below the grid,
 * and fetches the next page from /api/feed as it nears view, passing the ids
 * already shown so pages don't repeat (feed_by_taste re-randomises each call).
 *
 * Accessibility / efficiency:
 *   - A real "Load more" button is always rendered as the keyboard + reduced-data
 *     fallback; the IntersectionObserver just clicks it early. Users who can't or
 *     don't want to auto-load still advance the feed.
 *   - Status is announced via aria-live. Space is reserved so nothing shifts.
 *   - Stops (and hides the sentinel) once a page returns fewer than requested —
 *     the pool is exhausted.
 */
const PAGE = 30;
// How many recently-shown ids to send as the exclusion list. Older items are
// dropped from the feed server-side via the seen_at grace window anyway, so this
// only needs to cover the current in-flight window — keeps the query URL bounded.
const EXCLUDE_WINDOW = 250;

// Drop cards liked earlier this session. On a full page load the client store is
// empty (module reset), so SSR + hydration both see `initial` unchanged — no
// hydration mismatch. It only trims on a same-session client re-render (returning
// to home after liking), which the server-side role='taste' filter never sees.
// Order is preserved — this never reshuffles.
function withoutLiked(list: FeedItem[]): FeedItem[] {
  const liked = getLikedIds();
  return liked.size ? list.filter((it) => !liked.has(it.id)) : list;
}

export function InfiniteFeed({ initial }: { initial: FeedItem[] }) {
  const [items, setItems] = useState<FeedItem[]>(() => withoutLiked(initial));
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(initial.length < PAGE);
  const [error, setError] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Refs mirror the latest state so the observer callback (created once) can read
  // current values without being torn down/recreated. Synced in effects, never
  // mutated during render.
  const itemsRef = useRef(items);
  const loadingRef = useRef(loading);
  const doneRef = useRef(done);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);
  useEffect(() => {
    doneRef.current = done;
  }, [done]);

  // The server returns a freshly-randomised, taste-ranked page on every request
  // (feed_by_taste jitter + explore) and already excludes liked/imported items,
  // so a real site refresh looks fresh on its own — no client reshuffle needed.
  //
  // router.refresh() (e.g. after a discovery sweep) re-renders the server
  // component and hands us a NEW `initial` array. useState ignored it after mount,
  // so reset the accumulated list to the fresh, re-ranked page. Reference check,
  // not deep compare: a refresh always yields a new array instance.
  const initialRef = useRef(initial);
  useEffect(() => {
    if (initial === initialRef.current) return;
    initialRef.current = initial;
    setItems(withoutLiked(initial));
    setDone(initial.length < PAGE);
    setError(false);
  }, [initial]);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || doneRef.current) return;
    const cur = itemsRef.current;
    loadingRef.current = true; // guard immediately (state update is async)
    setLoading(true);
    setError(false);
    try {
      const exclude = cur
        .slice(-EXCLUDE_WINDOW)
        .map((it) => it.id)
        .join(",");
      const res = await fetch(`/api/feed?limit=${PAGE}&exclude=${encodeURIComponent(exclude)}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { items?: FeedItem[] };
      const next = data.items ?? [];
      if (next.length === 0) {
        setDone(true);
      } else {
        // Dedup defensively against anything already present — by id AND by source
        // image URL, since the same image can arrive under two ids (CDN variants).
        setItems((prev) => {
          const seenIds = new Set(prev.map((it) => it.id));
          const seenUrls = new Set(prev.map((it) => it.fullUrl));
          return [
            ...prev,
            ...next.filter((it) => !seenIds.has(it.id) && !seenUrls.has(it.fullUrl)),
          ];
        });
        if (next.length < PAGE) setDone(true);
      }
    } catch {
      setError(true); // leave the button so the user can retry
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || done) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      },
      // Start loading a bit before the sentinel is on screen, for a seamless feel.
      { rootMargin: "800px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [done, loadMore]);

  return (
    <>
      <MasonryFeed items={items} />

      <div ref={sentinelRef} className="mt-8 flex min-h-12 flex-col items-center justify-center">
        {!done && (
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            className="rounded-full border border-surface bg-surface px-5 py-2 text-sm font-medium transition-colors hover:bg-background disabled:opacity-50"
          >
            {loading ? "Weaving…" : error ? "Retry" : "Load more"}
          </button>
        )}
        <output aria-live="polite" className="mt-2 text-sm text-muted">
          {done
            ? "You've reached the end for now — pull in fresh discoveries."
            : error
              ? "Couldn't load more. Try again."
              : ""}
        </output>
        {/* At the end of the pool, let the user trigger a fresh discovery sweep. */}
        {done && <DiscoverButton />}
      </div>
    </>
  );
}
