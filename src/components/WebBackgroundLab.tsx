"use client";

import { useEffect, useState } from "react";

/**
 * Web background + live tuning lab.
 *
 * The generator models a real orb-weaver web, modularly:
 *   1. anchors  — a few irregular attachment points (lopsided frame, not a circle)
 *   2. frame    — taut threads bridging the anchors
 *   3. radials  — spokes from the hub that TERMINATE ON THE FRAME (ray→polygon),
 *                 so the silhouette is irregular like a real web
 *   4. spiral   — one continuous capture spiral, sagging inward between radials
 *   5. hub      — a small dense spiral at the center
 *   6. bridges  — stray anchor threads reaching off-screen
 *
 * Webs are placed procedurally (seeded) so you can add many without hand-coding
 * positions. Static SVG, rounded coords (hydration-safe), no animation → cheap.
 */

type Params = {
  mainOpacity: number;
  fineOpacity: number;
  dewOpacity: number;
  mainWidth: number;
  fineWidth: number;
  dewR: number;
  spokes: number;
  turns: number;
  anchors: number;
  angleJitter: number;
  lenVar: number;
  sagBase: number;
  sagVar: number;
  dewFreq: number;
  bridges: number;
  webCount: number;
};

const DEFAULTS: Params = {
  mainOpacity: 0.11,
  fineOpacity: 0.07,
  dewOpacity: 0.14,
  mainWidth: 0.85,
  fineWidth: 0.55,
  dewR: 0.9,
  spokes: 18,
  turns: 11,
  anchors: 5,
  angleJitter: 0.22,
  lenVar: 0.28,
  sagBase: 0.86,
  sagVar: 0.1,
  dewFreq: 0.06,
  bridges: 3,
  webCount: 5,
};

const W = 1440;
const H = 900;

// --- tiny deterministic PRNG ---
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type V = [number, number];
const f = (n: number) => n.toFixed(1);
const P = (p: V) => `${f(p[0])},${f(p[1])}`;
const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1]];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1]];
const scale = (a: V, s: number): V => [a[0] * s, a[1] * s];

type Base = { cx: number; cy: number; r: number; rotate: number; seed: number };

/** Procedurally place `count` webs, biased to edges/corners, partly off-screen. */
function genBases(count: number): Base[] {
  const rand = rng(1337);
  const bases: Base[] = [];
  // Edge anchor points around an expanded border.
  for (let i = 0; i < count; i++) {
    const edge = i % 4;
    const t = rand();
    let cx = 0,
      cy = 0;
    if (edge === 0) (cx = -140 + t * (W + 280)), (cy = -120 - rand() * 80);
    else if (edge === 1) (cx = W + 140 + rand() * 80), (cy = -80 + t * (H + 200));
    else if (edge === 2) (cx = -140 + t * (W + 280)), (cy = H + 120 + rand() * 80);
    else (cx = -140 - rand() * 80), (cy = -80 + t * (H + 200));
    bases.push({
      cx,
      cy,
      r: 380 + rand() * 280,
      rotate: rand() * Math.PI * 2,
      seed: 11 + i * 26 + Math.floor(rand() * 17),
    });
  }
  return bases;
}

// Ray (origin O, unit dir D) ∩ segment A→B. Returns distance t≥0 or null.
function raySeg(O: V, D: V, A: V, B: V): number | null {
  const e: V = sub(B, A);
  const denom = D[0] * e[1] - D[1] * e[0];
  if (Math.abs(denom) < 1e-6) return null;
  const diff = sub(A, O);
  const t = (diff[0] * e[1] - diff[1] * e[0]) / denom;
  const u = (diff[0] * D[1] - diff[1] * D[0]) / denom;
  if (t >= 0 && u >= -0.001 && u <= 1.001) return t;
  return null;
}

type Built = { main: string[]; fine: string[]; dew: V[] };

function buildWeb(base: Base, p: Params): Built {
  const { cx, cy, r, rotate, seed } = base;
  const hub: V = [cx, cy];
  const rand = rng(seed);
  const main: string[] = [];
  const fine: string[] = [];
  const dew: V[] = [];
  const anchorN = Math.max(3, Math.round(p.anchors));
  const spokes = Math.max(6, Math.round(p.spokes));
  const turns = Math.max(2, Math.round(p.turns));

  // 1. anchors — irregular ring of attachment points
  const anchors: V[] = [];
  for (let i = 0; i < anchorN; i++) {
    const a = rotate + (i / anchorN) * Math.PI * 2 + (rand() - 0.5) * p.angleJitter * 2;
    const dist = r * (1 - p.lenVar * 0.5 + rand() * p.lenVar);
    anchors.push([cx + Math.cos(a) * dist, cy + Math.sin(a) * dist]);
  }

  // 2. frame — taut threads between anchors (slight outward bow)
  for (let i = 0; i < anchorN; i++) {
    const a = anchors[i];
    const b = anchors[(i + 1) % anchorN];
    const mid = scale(add(a, b), 0.5);
    const out = sub(mid, hub);
    const ctrl = add(mid, scale(out, 0.04 + rand() * 0.05));
    main.push(`M${P(a)} Q${P(ctrl)} ${P(b)}`);
  }

  // 3. radials — terminate ON the frame polygon (ray → segment)
  const dirs: V[] = [];
  const lens: number[] = [];
  for (let s = 0; s < spokes; s++) {
    const a = rotate + (s / spokes) * Math.PI * 2 + (rand() - 0.5) * p.angleJitter;
    const D: V = [Math.cos(a), Math.sin(a)];
    let best = Infinity;
    for (let i = 0; i < anchorN; i++) {
      const t = raySeg(hub, D, anchors[i], anchors[(i + 1) % anchorN]);
      if (t !== null && t < best) best = t;
    }
    if (!isFinite(best)) best = r;
    const L = best * (0.96 + rand() * 0.04);
    dirs.push(D);
    lens.push(L);
    const end = add(hub, scale(D, L));
    const ctrl = add(hub, scale(D, L * 0.5 + (rand() - 0.5) * 8));
    main.push(`M${P(hub)} Q${P(ctrl)} ${P(end)}`);
  }

  // 4. capture spiral — one continuous thread, sagging inward between radials
  const inner = 0.16; // free zone after the hub
  const steps = turns * spokes;
  let d = "";
  let prev: V | null = null;
  for (let k = 0; k <= steps; k++) {
    const s = k % spokes;
    const frac = inner + (k / steps) * (1 - inner) * (0.85 + rand() * 0.3);
    const cur = add(hub, scale(dirs[s], Math.min(frac, 1) * lens[s]));
    if (!prev) {
      d = `M${P(cur)}`;
    } else {
      // Sticky-thread sag: pull the segment midpoint toward the hub.
      const mp = scale(add(prev, cur), 0.5);
      const pull = scale(sub(hub, mp), (1 - (p.sagBase + rand() * p.sagVar)) * 0.6);
      d += ` Q${P(add(mp, pull))} ${P(cur)}`;
    }
    if (rand() < p.dewFreq) dew.push(cur);
    prev = cur;
  }
  main.push(d);

  // 5. hub — small dense inner spiral
  let hd = "";
  const hubSteps = spokes * 2;
  for (let k = 0; k <= hubSteps; k++) {
    const s = k % spokes;
    const frac = (k / hubSteps) * inner * 0.9;
    const cur = add(hub, scale(dirs[s], frac * lens[s]));
    hd += k === 0 ? `M${P(cur)}` : ` L${P(cur)}`;
  }
  fine.push(hd);

  // 6. bridges — stray anchor threads off-screen
  for (let i = 0; i < Math.round(p.bridges); i++) {
    const aPt = anchors[Math.floor(rand() * anchorN)];
    const out = sub(aPt, hub);
    const far = add(aPt, scale(out, 0.4 + rand() * 0.6));
    fine.push(`M${P(aPt)} L${P(far)}`);
  }

  return { main, fine, dew };
}

function BackgroundSvg({ params }: { params: Params }) {
  const bases = genBases(Math.max(1, Math.round(params.webCount)));
  const webs = bases.map((b) => buildWeb(b, params));
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden text-foreground">
      <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" fill="none">
        {webs.map((b, i) => (
          <g key={i} stroke="currentColor" strokeLinecap="round">
            <g strokeWidth={params.mainWidth} strokeOpacity={params.mainOpacity}>
              {b.main.map((d, j) => (
                <path key={j} d={d} />
              ))}
            </g>
            <g strokeWidth={params.fineWidth} strokeOpacity={params.fineOpacity}>
              {b.fine.map((d, j) => (
                <path key={j} d={d} />
              ))}
            </g>
            <g fill="currentColor" stroke="none" fillOpacity={params.dewOpacity}>
              {b.dew.map((pt, j) => (
                <circle key={j} cx={f(pt[0])} cy={f(pt[1])} r={params.dewR} />
              ))}
            </g>
          </g>
        ))}
      </svg>
    </div>
  );
}

const SLIDERS: { key: keyof Params; label: string; min: number; max: number; step: number }[] = [
  { key: "mainOpacity", label: "Main opacity", min: 0, max: 0.3, step: 0.005 },
  { key: "fineOpacity", label: "Fine opacity", min: 0, max: 0.3, step: 0.005 },
  { key: "dewOpacity", label: "Dew opacity", min: 0, max: 0.4, step: 0.005 },
  { key: "mainWidth", label: "Main width", min: 0.2, max: 3, step: 0.05 },
  { key: "fineWidth", label: "Fine width", min: 0.2, max: 3, step: 0.05 },
  { key: "dewR", label: "Dew size", min: 0.3, max: 3, step: 0.1 },
  { key: "spokes", label: "Radials", min: 6, max: 32, step: 1 },
  { key: "turns", label: "Spiral turns", min: 2, max: 20, step: 1 },
  { key: "anchors", label: "Anchors", min: 3, max: 8, step: 1 },
  { key: "angleJitter", label: "Angle jitter", min: 0, max: 0.6, step: 0.01 },
  { key: "lenVar", label: "Length variance", min: 0, max: 0.6, step: 0.01 },
  { key: "sagBase", label: "Spiral sag", min: 0.6, max: 0.98, step: 0.01 },
  { key: "sagVar", label: "Sag variance", min: 0, max: 0.3, step: 0.01 },
  { key: "dewFreq", label: "Dew frequency", min: 0, max: 0.4, step: 0.01 },
  { key: "bridges", label: "Bridge threads", min: 0, max: 8, step: 1 },
  { key: "webCount", label: "Web count", min: 1, max: 14, step: 1 },
];

const STORAGE_KEY = "weaver-bg-params";

export function WebBackgroundLab() {
  const [params, setParams] = useState<Params>(DEFAULTS);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setParams({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(params));
    } catch {}
  }, [params]);

  const set = (k: keyof Params, v: number) => setParams((p) => ({ ...p, [k]: v }));

  return (
    <>
      <BackgroundSvg params={params} />
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Toggle background controls"
        aria-expanded={open}
        className="fixed bottom-4 left-4 z-50 rounded-full border border-surface bg-background/80 px-3 py-2 text-xs text-muted shadow-sm backdrop-blur hover:text-foreground"
      >
        ✦ web
      </button>
      {open && (
        <aside className="fixed bottom-16 left-4 z-50 max-h-[72vh] w-72 overflow-y-auto rounded-xl border border-surface bg-background/95 p-4 text-sm shadow-xl backdrop-blur">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Web background</h2>
            <button type="button" onClick={() => setParams(DEFAULTS)} className="text-xs text-muted hover:text-foreground">
              reset
            </button>
          </div>
          <div className="flex flex-col gap-3">
            {SLIDERS.map(({ key, label, min, max, step }) => (
              <label key={key} className="flex flex-col gap-1">
                <span className="flex justify-between text-xs text-muted">
                  <span>{label}</span>
                  <span className="tabular-nums text-foreground">{params[key]}</span>
                </span>
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={step}
                  value={params[key]}
                  onChange={(e) => set(key, Number(e.target.value))}
                  className="accent-ring"
                />
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(JSON.stringify(params, null, 2)).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
            className="mt-4 w-full rounded-lg bg-foreground py-2 text-xs font-medium text-background"
          >
            {copied ? "✓ Copied config" : "Copy config JSON"}
          </button>
        </aside>
      )}
    </>
  );
}
