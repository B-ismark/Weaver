"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

/**
 * Weaver — ambient spider-web background. Fixed, full-viewport, decorative.
 *
 * The geometry is deterministic SVG (a seeded PRNG jitters spoke angles/lengths,
 * makes ring radii uneven, varies the inward sag, breaks some rings, and scatters
 * faint "dew" nodes) so SSR/build output is stable and it looks hand-spun. Stroke
 * uses currentColor at low opacity → adapts to light/dark automatically.
 *
 * On mount the web SPINS ITSELF ON: GSAP's DrawSVGPlugin animates every thread
 * from 0 → full length with a randomised stagger, and the dew fades in after.
 * GSAP is lazy-imported so it stays out of the initial bundle. Under
 * prefers-reduced-motion the effect is skipped entirely and the finished web
 * renders statically — no motion, no flash.
 */

type Web = { cx: number; cy: number; r: number; spokes: number; rings: number; rotate: number; seed: number };

const W = 1440;
const H = 900;

const WEBS: Web[] = [
  { cx: -140, cy: -90, r: 560, spokes: 17, rings: 8, rotate: 0.2, seed: 11 },
  { cx: W + 180, cy: 90, r: 500, spokes: 15, rings: 7, rotate: -0.4, seed: 29 },
  { cx: W - 160, cy: H + 150, r: 600, spokes: 19, rings: 9, rotate: 0.9, seed: 47 },
  { cx: 180, cy: H + 90, r: 420, spokes: 13, rings: 6, rotate: -0.25, seed: 83 },
];

// mulberry32 — tiny deterministic PRNG.
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

const pt = (cx: number, cy: number, a: number, r: number): [number, number] => [
  cx + Math.cos(a) * r,
  cy + Math.sin(a) * r,
];
const f = (n: number) => n.toFixed(1);

type Built = { threads: string[]; fine: string[]; dew: [number, number][] };

function buildWeb(web: Web): Built {
  const { cx, cy, r, spokes, rings, rotate, seed } = web;
  const rand = rng(seed);
  const threads: string[] = [];
  const fine: string[] = [];
  const dew: [number, number][] = [];

  // Irregular spoke angles + lengths.
  const angles: number[] = [];
  const lengths: number[] = [];
  let acc = rotate;
  for (let s = 0; s < spokes; s++) {
    acc += (Math.PI * 2) / spokes + (rand() - 0.5) * 0.18; // jittered spacing
    angles.push(acc);
    lengths.push(r * (0.82 + rand() * 0.22)); // uneven spoke length
  }

  // Spokes — slight curve so they aren't dead straight.
  for (let s = 0; s < spokes; s++) {
    const [x, y] = pt(cx, cy, angles[s], lengths[s]);
    const [mx, my] = pt(cx, cy, angles[s] + (rand() - 0.5) * 0.05, lengths[s] * 0.5);
    threads.push(`M${f(cx)},${f(cy)} Q${f(mx)},${f(my)} ${f(x)},${f(y)}`);
  }

  // Rings — uneven radius per vertex, variable sag, some rings broken.
  for (let ring = 1; ring <= rings; ring++) {
    const base = (ring / rings) * r;
    const broken = rand() < 0.22; // occasionally an incomplete ring
    const start = broken ? Math.floor(rand() * spokes) : 0;
    const span = broken ? Math.floor(spokes * (0.4 + rand() * 0.4)) : spokes;

    let d = "";
    for (let k = 0; k <= span; k++) {
      const s = (start + k) % spokes;
      const rr = Math.min(base * (0.9 + rand() * 0.2), lengths[s]); // uneven, clamped to spoke
      const [x, y] = pt(cx, cy, angles[s], rr);
      if (k === 0) {
        d = `M${f(x)},${f(y)}`;
      } else {
        const prev = (start + k - 1) % spokes;
        const midA = (angles[prev] + angles[s]) / 2;
        const sag = rr * (0.82 + rand() * 0.12); // variable inward droop
        const [mx, my] = pt(cx, cy, midA, sag);
        d += ` Q${f(mx)},${f(my)} ${f(x)},${f(y)}`;
      }
      if (rand() < 0.08) dew.push([x, y]); // occasional dew node
    }
    (ring <= 2 ? fine : threads).push(d);
  }

  // A couple of stray anchor/bridge threads reaching past the web.
  for (let i = 0; i < 3; i++) {
    const s = Math.floor(rand() * spokes);
    const [x, y] = pt(cx, cy, angles[s] + (rand() - 0.5) * 0.1, lengths[s] * (1.1 + rand() * 0.3));
    fine.push(`M${f(cx)},${f(cy)} L${f(x)},${f(y)}`);
  }

  return { threads, fine, dew };
}

// useLayoutEffect warns during SSR; fall back to useEffect on the server.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

export function WeaverBackground() {
  const built = WEBS.map(buildWeb);
  const svgRef = useRef<SVGSVGElement>(null);

  // Draw the web on with GSAP DrawSVG. Runs in a layout effect so we can hide the
  // (already full-length) SVG before the browser paints — no full-web flash while
  // GSAP lazy-loads. Skipped entirely under reduced motion → static web.
  useIsoLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg || prefersReducedMotion()) return;

    // Hide before first paint; GSAP reveals it once the threads are set to 0.
    svg.style.opacity = "0";
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ctx: any;

    (async () => {
      const [{ gsap }, { DrawSVGPlugin }] = await Promise.all([
        import("gsap"),
        import("gsap/DrawSVGPlugin"),
      ]);
      if (cancelled) {
        svg.style.opacity = "1";
        return;
      }
      gsap.registerPlugin(DrawSVGPlugin);
      ctx = gsap.context(() => {
        const threads = svg.querySelectorAll("path");
        const dew = svg.querySelectorAll("circle");
        gsap.set(svg, { opacity: 1 });
        gsap.set(threads, { drawSVG: "0%" });
        gsap.to(threads, {
          drawSVG: "100%",
          duration: 1.6,
          ease: "power2.out",
          stagger: { each: 0.012, from: "random" },
        });
        gsap.from(dew, { opacity: 0, scale: 0, transformOrigin: "center", duration: 0.9, delay: 0.9, stagger: 0.01 });
      }, svg);
    })();

    return () => {
      cancelled = true;
      ctx?.revert?.();
      svg.style.opacity = "1";
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden text-foreground"
    >
      <svg ref={svgRef} width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" fill="none">
        {built.map((b, i) => (
          <g key={i} stroke="currentColor" strokeLinecap="round">
            {/* main threads — more visible */}
            <g strokeWidth={0.9} strokeOpacity={0.1}>
              {b.threads.map((d, j) => (
                <path key={j} d={d} />
              ))}
            </g>
            {/* fine inner spiral + bridge threads — fainter */}
            <g strokeWidth={0.6} strokeOpacity={0.06}>
              {b.fine.map((d, j) => (
                <path key={j} d={d} />
              ))}
            </g>
            {/* dew nodes — the web-hub gold, tying the ambient web to the accent. */}
            <g style={{ color: "var(--accent)" }} fill="currentColor" stroke="none" fillOpacity={0.16}>
              {b.dew.map(([x, y], j) => (
                <circle key={j} cx={x} cy={y} r={0.9} />
              ))}
              {/* faint gold hub glow at each web's centre. */}
              <circle cx={WEBS[i].cx} cy={WEBS[i].cy} r={2.2} fillOpacity={0.5} />
            </g>
          </g>
        ))}
      </svg>
    </div>
  );
}
