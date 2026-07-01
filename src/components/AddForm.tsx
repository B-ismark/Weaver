"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Add-by-URL: paste any page or image link and Weaver scrapes its image, embeds
 * it, and adds it to your taste set (POST /api/share). Also renders the
 * bookmarklet — a one-click "send this page to Weaver" for the browser toolbar.
 *
 * When opened as /add?url=… (what the bookmarklet does), it prefills and
 * auto-submits, so the flow is: click bookmarklet on any page → this tab opens →
 * "Added to your taste."
 *
 * Accessibility: labelled input, disabled state while working, polite live region.
 */
type Status = "" | "working" | "added" | "duplicate" | "error";

export function AddForm({ initialUrl = "" }: { initialUrl?: string }) {
  const [url, setUrl] = useState(initialUrl);
  const [status, setStatus] = useState<Status>("");
  const [message, setMessage] = useState("");
  const bookmarkletRef = useRef<HTMLAnchorElement>(null);
  const autoSubmitted = useRef(false);

  async function submit(target: string) {
    const value = target.trim();
    if (!value) return;
    setStatus("working");
    setMessage("Fetching and weaving in…");
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: value }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; duplicate?: boolean; error?: string };
      if (res.ok && data.ok) {
        setStatus(data.duplicate ? "duplicate" : "added");
        setMessage(data.duplicate ? "Already in your taste set." : "Added to your taste.");
      } else {
        setStatus("error");
        setMessage(data.error ?? "Couldn't add that link.");
      }
    } catch {
      setStatus("error");
      setMessage("Network error — try again.");
    }
  }

  // Bookmarklet href is set via DOM (not a javascript: JSX attribute) so it's
  // draggable to the toolbar without tripping lint/CSP on the source.
  useEffect(() => {
    const a = bookmarkletRef.current;
    if (!a) return;
    const origin = window.location.origin;
    a.href = `javascript:void(window.open('${origin}/add?url='+encodeURIComponent(location.href),'_blank'))`;
  }, []);

  // Auto-submit when arriving via the bookmarklet (?url=…).
  useEffect(() => {
    if (initialUrl && !autoSubmitted.current) {
      autoSubmitted.current = true;
      submit(initialUrl);
    }
  }, [initialUrl]);

  const busy = status === "working";

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(url);
        }}
        className="flex flex-col gap-3"
      >
        <label htmlFor="add-url" className="text-sm font-medium">
          Paste a link or image URL
        </label>
        <div className="flex gap-2">
          <input
            id="add-url"
            type="url"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            className="flex-1 rounded-lg border border-surface bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
          />
          <button
            type="submit"
            disabled={busy || !url.trim()}
            className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
          >
            {busy ? "Adding…" : "Add"}
          </button>
        </div>
        <output
          aria-live="polite"
          className={`min-h-5 text-sm ${status === "error" ? "text-red-500" : "text-muted"}`}
        >
          {message}
        </output>
      </form>

      <div className="rounded-lg border border-surface bg-surface/50 p-4">
        <p className="text-sm font-medium">One-click add: the bookmarklet</p>
        <p className="mt-1 text-sm text-muted">
          Drag this to your bookmarks bar. On any page — a pin, a post, an artwork —
          click it to send that page to Weaver.
        </p>
        <a
          ref={bookmarkletRef}
          href="/add"
          onClick={(e) => e.preventDefault()}
          className="mt-3 inline-block cursor-grab rounded-md border border-accent/60 bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent"
          draggable
        >
          ✦ Save to Weaver
        </a>
      </div>
    </div>
  );
}
