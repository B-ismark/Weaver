"use client";

import { useState } from "react";

type SyncResult = {
  ok?: boolean;
  pulled?: number;
  fresh?: number;
  embedded?: number;
  stored?: number;
  reclusterRecommended?: boolean;
  error?: string;
};

const STATUS_MESSAGE: Record<string, { text: string; tone: "ok" | "err" }> = {
  connected: { text: "Pinterest connected.", tone: "ok" },
  denied: { text: "Authorization was denied.", tone: "err" },
  bad_state: { text: "Auth failed (state mismatch). Try again.", tone: "err" },
  error: { text: "Token exchange failed. Try again.", tone: "err" },
};

/**
 * Pinterest live-fetch controls (D4). Connect kicks off OAuth; once connected,
 * "Sync now" pulls saved pins as taste signal and re-clusters. The scheduled
 * cron does the same automatically on a deployed app — this is the manual path.
 */
export function PinterestPanel({
  configured,
  connected,
  canOAuth,
  status,
}: {
  configured: boolean;
  connected: boolean;
  canOAuth: boolean;
  status?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const banner = status ? STATUS_MESSAGE[status] : null;

  async function syncNow() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/pinterest/sync", { method: "POST" });
      const data = (await res.json()) as SyncResult;
      setResult(data);
      // New taste signal → refresh centroids so the feed actually shifts.
      if (data.ok && data.stored) await fetch("/api/recluster", { method: "POST" });
    } catch {
      setResult({ error: "Network error — is the dev server running?" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-8 rounded-xl border border-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Pinterest auto-sync</h2>
          <p className="text-xs text-muted">
            Pull your saved pins automatically as taste signal — no manual export.
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
            connected ? "bg-emerald-500/15 text-emerald-400" : "bg-surface text-muted"
          }`}
        >
          {connected ? "Connected" : "Not connected"}
        </span>
      </div>

      {banner && (
        <p
          className={`mt-3 text-sm ${banner.tone === "ok" ? "text-emerald-400" : "text-red-500"}`}
        >
          {banner.text}
        </p>
      )}

      {!configured ? (
        <p className="mt-3 text-xs text-muted">
          Fast path: paste a generated token as <code>PINTEREST_ACCESS_TOKEN</code> in{" "}
          <code>.env.local</code> and restart. Or set <code>PINTEREST_CLIENT_ID</code>,{" "}
          <code>PINTEREST_CLIENT_SECRET</code>, <code>PINTEREST_REDIRECT_URI</code> for the full
          OAuth flow.
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {canOAuth && (
            <a
              href="/api/pinterest/auth"
              className="rounded-full border border-surface px-4 py-2 text-sm hover:bg-surface"
            >
              {connected ? "Reconnect" : "Connect Pinterest"}
            </a>
          )}
          {connected && (
            <button
              type="button"
              onClick={syncNow}
              disabled={busy}
              className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
            >
              {busy ? "Syncing…" : "Sync now"}
            </button>
          )}
        </div>
      )}

      <output aria-live="polite" className="text-sm">
        {result?.error && <p className="mt-3 text-red-500">Error: {result.error}</p>}
        {result?.ok && (
          <ul className="mt-3 space-y-1 text-muted">
            <li>Pulled: {result.pulled}</li>
            <li>New (after dedup): {result.fresh}</li>
            <li>Embedded: {result.embedded}</li>
            <li className="font-medium text-foreground">Stored as taste: {result.stored}</li>
          </ul>
        )}
      </output>
    </section>
  );
}
