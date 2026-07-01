"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/**
 * Manual discovery trigger (was a dead instruction — the empty feed told users
 * to "run a discovery refresh" with no way to do it).
 *
 * Cap-safe, smart, and fast:
 *   1. CAP-SAFE — the serverless 60s ceiling and EMBED_CAP (~30 embeds) are sized
 *      so ONE source fits ONE invocation. We fan out CLIENT-side (one request per
 *      source) so each source gets its own fresh 60s budget; cramming all sources
 *      into a single POST would run them back-to-back in one 60s box and 504.
 *   2. SMART — first hit the doctor (GET, no embed/store) to learn which sources
 *      respond TODAY, then only sweep the healthy ones. No invocations wasted on
 *      sources that are blocked/erroring. Falls back to the full list if the
 *      doctor itself fails.
 *   3. FAST — healthy sources run through a small concurrency pool instead of
 *      strictly sequentially, roughly halving wall-clock. Pool is kept small: the
 *      HF embed Space cold-starts and rate-limits, so a wide parallel fan-out
 *      would thrash it.
 *
 * A per-source failure is tolerated (contributes 0), and the feed refreshes once
 * at the end. Accessible: busy + progress announced via aria-live.
 */
// Keyless / open sources (mirrors the route's SOURCES; reddit omitted — 403s;
// europeana/smithsonian omitted — they only produce with an API key set server-side).
const SOURCES = [
  "arena",
  "openverse",
  "artstation",
  "artic",
  "metmuseum",
  "wikimedia",
  "cleveland",
  "nasa",
] as const;
const POOL = 3; // concurrent invocations — small, to respect the HF Space.

type Doctor = { ok?: boolean; summary?: { ok?: string[] } };

export function DiscoverButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [, startTransition] = useTransition();

  async function run() {
    setBusy(true);
    setError("");
    setProgress("Checking sources…");

    // 1. Doctor-gate: only sweep sources that respond today.
    let targets: string[] = [...SOURCES];
    try {
      const res = await fetch(`/api/discover?sources=${SOURCES.join(",")}`);
      const data = (await res.json().catch(() => ({}))) as Doctor;
      const healthy = data.ok ? data.summary?.ok?.filter((s) => SOURCES.includes(s as never)) : null;
      if (healthy?.length) targets = healthy;
    } catch {
      // doctor unreachable → fall back to the full list
    }

    // 2. Fan out through a small pool; each source is its own invocation/budget.
    let done = 0;
    let stored = 0;
    let failed = 0;
    let next = 0;

    const worker = async () => {
      while (next < targets.length) {
        const source = targets[next++];
        try {
          const res = await fetch("/api/discover", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ source }),
          });
          const data = (await res.json().catch(() => ({}))) as { ok?: boolean; stored?: number };
          if (res.ok && data.ok) stored += data.stored ?? 0;
          else failed++;
        } catch {
          failed++; // network/timeout on one source — keep sweeping the rest
        } finally {
          done++;
          setProgress(`Discovering… ${done}/${targets.length}`);
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(POOL, targets.length) }, worker));

    setBusy(false);
    if (stored === 0 && failed === targets.length) {
      setError("Discovery failed — no sources responded. Try again.");
      setProgress("");
      return;
    }
    setProgress(
      `Added ${stored} new image${stored === 1 ? "" : "s"}` +
        (failed ? ` · ${failed} source${failed === 1 ? "" : "s"} skipped` : "")
    );
    startTransition(() => router.refresh());
  }

  return (
    <div className="mt-6 flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background disabled:opacity-50"
      >
        {busy ? "Discovering…" : "Run discovery"}
      </button>
      <output aria-live="polite" className="text-sm text-muted">
        {error ? <span className="text-red-500">{error}</span> : progress}
      </output>
    </div>
  );
}
