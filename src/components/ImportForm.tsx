"use client";

import { useState } from "react";

type ImportResult = {
  ok?: boolean;
  parsed?: number;
  skipped?: number;
  cached?: number;
  deduped?: number;
  stored?: number;
  warnings?: { record: string; reason: string }[];
  error?: string;
};

/**
 * Manual export import form (§7). Single-user, so kept simple: pick platform,
 * choose the export file, submit. Accessible: labelled controls, busy state
 * announced via aria-live, keyboard-friendly.
 */
export function ImportForm() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        body: new FormData(e.currentTarget),
      });
      setResult((await res.json()) as ImportResult);
    } catch {
      setResult({ error: "Network error — is the dev server running?" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="platform" className="text-sm font-medium">
          Platform
        </label>
        <select
          id="platform"
          name="platform"
          defaultValue="pinterest"
          className="rounded-lg border border-surface bg-background px-3 py-2"
        >
          <option value="pinterest">Pinterest</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="file" className="text-sm font-medium">
          Export file (saved-pins JSON or CSV)
        </label>
        <input
          id="file"
          name="file"
          type="file"
          accept=".json,.csv,application/json,text/csv"
          required
          className="rounded-lg border border-surface bg-background px-3 py-2 file:mr-3 file:rounded-md file:border-0 file:bg-surface file:px-3 file:py-1"
        />
        <p className="text-xs text-muted">
          Unzip the Pinterest export and pick the saved-pins file.
        </p>
      </div>

      <button
        type="submit"
        disabled={busy}
        className="self-start rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background disabled:opacity-50"
      >
        {busy ? "Importing…" : "Import"}
      </button>

      <output aria-live="polite" className="text-sm">
        {busy && <p className="text-muted">Fetching images, caching thumbnails, storing…</p>}
        {result?.error && <p className="text-red-500">Error: {result.error}</p>}
        {result?.ok && (
          <ul className="mt-2 space-y-1 text-muted">
            <li>Parsed: {result.parsed}</li>
            <li>Skipped (no image): {result.skipped}</li>
            <li>Thumbnails cached: {result.cached}</li>
            <li>After dedup: {result.deduped}</li>
            <li className="font-medium text-foreground">Stored: {result.stored}</li>
            {!!result.warnings?.length && (
              <li className="text-xs">{result.warnings.length} warning(s)</li>
            )}
          </ul>
        )}
      </output>
    </form>
  );
}
