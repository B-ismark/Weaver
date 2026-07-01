"use client";

import { useEffect, useMemo, useState } from "react";
import Particles, { ParticlesProvider } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";
import type { ISourceOptions } from "@tsparticles/engine";

/**
 * Ambient "silk motes" — faint gold dew drifting behind the content, with thin
 * links that form and break between nearby motes: drifting web strands, the
 * orb-weaver motif in motion. Decorative only.
 *
 * Cost-gated hard, to respect the efficiency + responsiveness principles:
 *  - Never mounts under prefers-reduced-motion.
 *  - Desktop only (≥1024px) — skipped on phones/tablets where the canvas would
 *    cost battery/CPU for little payoff.
 *  - Slim engine bundle, low particle count, fps-capped, no interactivity.
 *  - Client-only + lazy: the engine loads after hydration, off the LCP path.
 *
 * Sits at z-index -9: above the static web background (-z-10), behind all
 * content, pointer-events none so it never intercepts clicks.
 */
export function SilkMotes() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const wide = window.matchMedia("(min-width: 1024px)");
    const update = () => setEnabled(!reduce.matches && wide.matches);
    update();
    reduce.addEventListener("change", update);
    wide.addEventListener("change", update);
    return () => {
      reduce.removeEventListener("change", update);
      wide.removeEventListener("change", update);
    };
  }, []);

  const options = useMemo<ISourceOptions>(
    () => ({
      fullScreen: { enable: true, zIndex: -9 },
      detectRetina: true,
      fpsLimit: 60,
      particles: {
        number: { value: 34 },
        color: { value: "#c9a227" }, // web-hub gold
        shape: { type: "circle" },
        size: { value: { min: 1, max: 3 } },
        opacity: {
          value: { min: 0.2, max: 0.6 },
          animation: { enable: true, speed: 0.5, sync: false },
        },
        move: {
          enable: true,
          speed: 0.35,
          direction: "none",
          random: true,
          straight: false,
          outModes: { default: "out" },
        },
        links: {
          enable: true,
          color: "#c9a227",
          distance: 160,
          opacity: 0.14,
          width: 1,
        },
      },
      interactivity: {
        events: { onHover: { enable: false }, onClick: { enable: false } },
      },
    }),
    []
  );

  if (!enabled) return null;

  return (
    <ParticlesProvider
      init={async (engine) => {
        await loadSlim(engine);
      }}
    >
      <Particles id="silk-motes" options={options} />
    </ParticlesProvider>
  );
}
