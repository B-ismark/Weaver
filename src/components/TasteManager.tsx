"use client";

import { useEffect, useState } from "react";

type Keyword = { id: string; text: string; polarity: "positive" | "negative" };

/**
 * Taste keyword manager (Pinterest "interests", but free-text). Add concepts to
 * steer the feed — positive pulls toward, negative pushes away. Each is embedded
 * by the CLIP text tower into the same space as images, so it shapes ranking
 * directly. Accessible: labelled controls, keyboard add, removable chips.
 */
export function TasteManager() {
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [text, setText] = useState("");
  const [polarity, setPolarity] = useState<"positive" | "negative">("positive");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function load() {
    const res = await fetch("/api/keywords");
    if (res.ok) setKeywords((await res.json()).keywords ?? []);
  }
  useEffect(() => {
    // load() is async — setState runs after the fetch resolves, not synchronously
    // in the effect body, so this isn't the cascading-render case the rule targets.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setErr("");
    const res = await fetch("/api/keywords", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: t, polarity }),
    });
    if (res.ok) {
      setText("");
      await load();
    } else {
      setErr((await res.json()).error ?? "failed");
    }
    setBusy(false);
  }

  async function remove(id: string) {
    await fetch(`/api/keywords?id=${id}`, { method: "DELETE" });
    setKeywords((k) => k.filter((x) => x.id !== id));
  }

  const positive = keywords.filter((k) => k.polarity === "positive");
  const negative = keywords.filter((k) => k.polarity === "negative");

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={add} className="flex flex-wrap items-end gap-3">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="kw" className="text-sm font-medium">
            Add an interest
          </label>
          <input
            id="kw"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. brutalist architecture, muted film photography"
            className="rounded-lg border border-surface bg-background px-3 py-2 text-sm"
          />
        </div>
        <fieldset className="flex gap-1" aria-label="Polarity">
          <button
            type="button"
            onClick={() => setPolarity("positive")}
            aria-pressed={polarity === "positive"}
            className={`rounded-lg px-3 py-2 text-sm ${polarity === "positive" ? "bg-foreground text-background" : "bg-surface"}`}
          >
            More
          </button>
          <button
            type="button"
            onClick={() => setPolarity("negative")}
            aria-pressed={polarity === "negative"}
            className={`rounded-lg px-3 py-2 text-sm ${polarity === "negative" ? "bg-foreground text-background" : "bg-surface"}`}
          >
            Less
          </button>
        </fieldset>
        <button type="submit" disabled={busy} className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background disabled:opacity-50">
          {busy ? "Adding…" : "Add"}
        </button>
      </form>
      {err && <p className="text-sm text-red-500">{err}</p>}

      <section>
        <h2 className="mb-2 text-sm font-semibold">More like this</h2>
        <Chips items={positive} onRemove={remove} tone="positive" empty="No positive interests yet." />
      </section>
      <section>
        <h2 className="mb-2 text-sm font-semibold">Less like this</h2>
        <Chips items={negative} onRemove={remove} tone="negative" empty="Nothing muted yet." />
      </section>
    </div>
  );
}

function Chips({
  items,
  onRemove,
  tone,
  empty,
}: {
  items: Keyword[];
  onRemove: (id: string) => void;
  tone: "positive" | "negative";
  empty: string;
}) {
  if (items.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((k) => (
        <li
          key={k.id}
          className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm ${
            tone === "positive" ? "bg-surface" : "bg-surface line-through decoration-muted"
          }`}
        >
          <span>{k.text}</span>
          <button
            type="button"
            onClick={() => onRemove(k.id)}
            aria-label={`Remove ${k.text}`}
            className="text-muted hover:text-foreground"
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}
