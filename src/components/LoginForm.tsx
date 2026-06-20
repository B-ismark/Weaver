"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/** Passcode entry for the single-user gate. Redirects to `next` on success. */
export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const [passcode, setPasscode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      if (res.ok) {
        router.replace(next);
        router.refresh();
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || "Incorrect passcode");
        setBusy(false);
      }
    } catch {
      setError("Network error — try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <label htmlFor="passcode" className="text-sm font-medium">
        Passcode
      </label>
      <input
        id="passcode"
        type="password"
        autoComplete="current-password"
        value={passcode}
        onChange={(e) => setPasscode(e.target.value)}
        autoFocus
        required
        className="rounded-lg border border-surface bg-background px-3 py-2"
      />
      <button
        type="submit"
        disabled={busy || !passcode}
        className="self-start rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background disabled:opacity-50"
      >
        {busy ? "Checking…" : "Enter"}
      </button>
      <output aria-live="polite" className="text-sm">
        {error && <p className="text-red-500">{error}</p>}
      </output>
    </form>
  );
}
