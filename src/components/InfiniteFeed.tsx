"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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
 * Back-navigation restore (the reason you don't lose your place returning from a
 * detail view):
 *   The accumulated pages live in React state, which is thrown away when this
 *   component unmounts on navigation — and the home route is force-dynamic, so
 *   router.back() would refetch a freshly-jittered first page (the "reshuffle +
 *   jump to top" bug). We fix it entirely on the client: the full item list, the
 *   `done` flag, and the scroll offset are snapshotted to sessionStorage, keyed to
 *   THIS history entry. On a back/forward traversal the entry's key is still in
 *   history.state, so we restore the exact list + scroll before the browser paints.
 *   A fresh navigation (wordmark, first load) has no key → new feed, as intended.
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

// sessionStorage keys. Items+done are heavy so they're written only when the list
// changes; scroll is light and written (throttled) on every scroll frame — split
// so we never re-serialise the whole list just to record a scroll offset.
const ITEMS_KEY = "weaver:feed:items";
const SCROLL_KEY = "weaver:feed:scroll";
// A field we stash on history.state to tag a home-feed history entry. Distinct
// from Next's own routing fields, and preserved by the browser across back/forward.
const FEED_KEY_FIELD = "__weaverFeedKey";

type ItemsSnap = { key: string; items: FeedItem[]; done: boolean };
type ScrollSnap = { key: string; y: number };

// useLayoutEffect warns during SSR; fall back to useEffect on the server.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * The persistent key for this history entry. If one is already on history.state
 * we're on a known entry (back/forward, or a reload of the same entry) → return it
 * so the matching snapshot restores. Otherwise this is a fresh entry → mint a key,
 * attach it (merging, so Next's own state survives), and report it as fresh so we
 * keep the server's `initial` feed.
 */
function resolveFeedKey(): { key: string; fresh: boolean } {
  if (typeof window === "undefined") return { key: "", fresh: true };
  const state = (window.history.state ?? {}) as Record<string, unknown>;
  const existing = typeof state[FEED_KEY_FIELD] === "string" ? (state[FEED_KEY_FIELD] as string) : null;
  if (existing) return { key: existing, fresh: false };
  const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    window.history.replaceState({ ...state, [FEED_KEY_FIELD]: key }, "");
  } catch {
    /* replaceState can throw in exotic sandboxes — degrade to no-restore. */
  }
  return { key, fresh: true };
}

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

  // The key that ties this component's snapshots to its history entry. Set once,
  // synchronously, in the restore layout effect below (before any save runs).
  const feedKeyRef = useRef("");
  // Tracks the `initial` instance we've adopted, so the discovery-refresh reset
  // effect fires only on a genuinely new server page — never on mount or restore.
  const initialRef = useRef(initial);

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

  // RESTORE (runs once, pre-paint). If we're returning to a known history entry,
  // swap the server's first page for the full snapshotted list + scroll position
  // so returning from a detail view lands exactly where you left. Runs in a layout
  // effect so the restored list is committed before the browser paints — no flash
  // of the short first page, no jump to top.
  const restoredRef = useRef(false);
  useIsoLayoutEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    const { key, fresh } = resolveFeedKey();
    feedKeyRef.current = key;
    if (fresh || !key) return; // brand-new entry → keep server `initial`

    try {
      const rawItems = sessionStorage.getItem(ITEMS_KEY);
      if (!rawItems) return;
      const snap = JSON.parse(rawItems) as ItemsSnap;
      if (snap.key !== key || !Array.isArray(snap.items) || snap.items.length === 0) return;

      setItems(snap.items);
      setDone(snap.done);
      initialRef.current = initial; // adopt current `initial` so the reset effect below stays quiet

      const rawScroll = sessionStorage.getItem(SCROLL_KEY);
      if (rawScroll) {
        const target = JSON.parse(rawScroll) as ScrollSnap;
        if (target.key === key && target.y > 0) restoreScroll(target.y);
      }
    } catch {
      /* corrupt snapshot — fall through to the server feed. */
    }
  }, []);

  // PERSIST the list. Heavy, so keyed off list changes only (append, hide, refresh).
  useEffect(() => {
    const key = feedKeyRef.current;
    if (!key) return;
    try {
      sessionStorage.setItem(ITEMS_KEY, JSON.stringify({ key, items, done } satisfies ItemsSnap));
    } catch {
      /* quota / private mode — restore simply won't be available. */
    }
  }, [items, done]);

  // PERSIST the scroll offset, throttled to one write per frame while scrolling.
  useEffect(() => {
    let queued = false;
    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        const key = feedKeyRef.current;
        if (!key) return;
        try {
          sessionStorage.setItem(
            SCROLL_KEY,
            JSON.stringify({ key, y: window.scrollY } satisfies ScrollSnap)
          );
        } catch {
          /* ignore */
        }
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // The server returns a freshly-randomised, taste-ranked page on every request
  // (feed_by_taste jitter + explore) and already excludes liked/imported items,
  // so a real site refresh looks fresh on its own — no client reshuffle needed.
  //
  // router.refresh() (e.g. after a discovery sweep) re-renders the server
  // component and hands us a NEW `initial` array. useState ignored it after mount,
  // so reset the accumulated list to the fresh, re-ranked page. Reference check,
  // not deep compare: a refresh always yields a new array instance. (On mount and
  // on a restore we adopt `initial` into the ref, so this only fires on a genuine
  // later refresh — never clobbering a restore.)
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

/**
 * Jump the window to a saved offset once the restored grid is tall enough to hold
 * it. The grid reserves each tile's box from its aspect ratio (no image decode
 * needed), so full height lands within a frame or two of the list committing —
 * but we retry across a short rAF budget in case column measurement lags, and
 * bail (scrolling as far as we can) rather than loop forever.
 */
function restoreScroll(y: number) {
  if (typeof window === "undefined") return;
  // Own the restore ourselves so the browser's native attempt (against the still-
  // short DOM) can't clamp us to the top first.
  const previous = window.history.scrollRestoration;
  try {
    window.history.scrollRestoration = "manual";
  } catch {
    /* ignore */
  }

  let tries = 0;
  const MAX_TRIES = 60; // ~1s at 60fps
  const tick = () => {
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    if (maxScroll >= y - 2 || tries >= MAX_TRIES) {
      window.scrollTo(0, y);
      try {
        window.history.scrollRestoration = previous ?? "auto";
      } catch {
        /* ignore */
      }
      return;
    }
    tries += 1;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
