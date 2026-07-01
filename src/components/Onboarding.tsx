"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/**
 * Cold-start onboarding for an empty feed.
 *
 * The feed is empty when there are no candidates yet — and if there's also no
 * taste signal, discovery has nothing to rank against. The fastest zero-import
 * path is to pick a few "vibes": each becomes a positive taste keyword (a CLIP
 * text embedding), which both seeds discovery queries AND steers ranking
 * immediately — no Pinterest import required. We then kick off a discovery sweep
 * and refresh.
 *
 * Also offers the fuller paths (import saves / add links). Accessible: chips are
 * toggle buttons with aria-pressed; progress announced via aria-live.
 */
const VIBES = [
  "minimalist",
  "brutalist architecture",
  "film photography",
  "warm earth tones",
  "nature landscape",
  "editorial design",
  "vintage",
  "moody & dark",
  "pastel",
  "street photography",
  "abstract art",
  "interior design",
];

// Fast, keyless sources to seed the first feed (mirrors the discover route).
const SEED_SOURCES = ["arena", "wikimedia", "cleveland", "nasa"];

export function Onboarding() {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [, startTransition] = useTransition();

  function toggle(v: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  }

  async function start() {
    const vibes = [...picked];
    if (!vibes.length) return;
    setBusy(true);

    // 1. Store the picks as positive taste keywords (embedded via the Space).
    setProgress("Learning your vibes…");
    await Promise.all(
      vibes.map((text) =>
        fetch("/api/keywords", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, polarity: "positive" }),
        }).catch(() => {})
      )
    );

    // 2. Sweep a few fast sources so the feed has something to show.
    setProgress("Gathering first images…");
    let done = 0;
    for (const source of SEED_SOURCES) {
      await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source }),
      }).catch(() => {});
      setProgress(`Gathering first images… ${++done}/${SEED_SOURCES.length}`);
    }

    setBusy(false);
    setProgress("Weaving your feed…");
    startTransition(() => router.refresh());
  }

  return (
    <div className="mx-auto max-w-2xl py-12">
      <h2 className="font-display text-2xl font-medium">Let&apos;s find your thread</h2>
      <p className="mt-2 text-sm text-muted">
        Pick a few things you&apos;re drawn to. Weaver learns from them and starts
        surfacing new images to match — no import needed.
      </p>

      <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Starter vibes">
        {VIBES.map((v) => {
          const on = picked.has(v);
          return (
            <button
              key={v}
              type="button"
              onClick={() => toggle(v)}
              aria-pressed={on}
              disabled={busy}
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                on
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-surface bg-surface text-foreground hover:bg-background"
              }`}
            >
              {v}
            </button>
          );
        })}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={start}
          disabled={busy || picked.size === 0}
          className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {busy ? "Weaving…" : `Weave my feed${picked.size ? ` (${picked.size})` : ""}`}
        </button>
        <output aria-live="polite" className="text-sm text-muted">
          {progress}
        </output>
      </div>

      <p className="mt-8 text-sm text-muted">
        Prefer the full picture?{" "}
        <Link href="/import" className="text-accent underline-offset-2 hover:underline">
          Import your saves
        </Link>{" "}
        or{" "}
        <Link href="/add" className="text-accent underline-offset-2 hover:underline">
          add a few links
        </Link>
        .
      </p>
    </div>
  );
}
