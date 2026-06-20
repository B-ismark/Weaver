import type { MetadataRoute } from "next";

/**
 * Weaver PWA manifest (§8 PWA-first). Generated via Next.js App Router so it's
 * typed and auto-linked into <head>. Icons live in /public (add real ones later).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Weaver — your visual taste, woven together",
    short_name: "Weaver",
    description:
      "A personal aggregator that gathers images you've engaged with across your accounts and ranks them to your taste.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    orientation: "portrait-primary",
    // TODO Phase 1: replace with real 192/512 PNG + maskable icons (use a
    // favicon generator, place in /public). Using favicon.ico for now so the
    // manifest is valid and there are no 404s.
    icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
  };
}
