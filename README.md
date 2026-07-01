# Weaver

A single-user, taste-driven visual **discovery** engine. Weaver learns your
taste from images you've engaged with across platforms (the "taste signal"),
then surfaces **new** images you haven't seen — pulled from open art/image
sources and ranked by how closely they match your taste. It is deliberately
*not* a re-display of your own saves; regurgitating already-seen content was
rejected as pointless.

The visual identity is the **orb-weaver spider web**: a hand-spun web background,
a gold "hub" wordmark, silk-thread micro-interactions, and a per-tile gold
"match" thread whose length tracks the real taste-match score.

## Stack

- **Next.js 16** (App Router, Turbopack) + **React 19** + **Tailwind v4** — PWA.
- **Supabase** — Postgres + `pgvector` (embeddings), storage (cached thumbnails),
  RLS-hardened core tables.
- **OpenCLIP ViT-B/32** — image embeddings computed offline; a free **HF Space**
  hosts the CLIP text tower for live search + keyword taste-steering.
- Taste model: k-means **centroids** over embedded taste items; the feed is
  ranked by cosine similarity to those centroids, with diversity + exploration
  mixing and already-seen exclusion (`feed_by_taste`).
- Discovery sources (keyless / open): **Are.na, Openverse, Wikimedia, Art
  Institute of Chicago, The Met** (+ Reddit/Pinterest behind credentials). A
  daily **GitHub Actions** cron drives refresh; `$0` infra budget.

## Motion & animation

Layered, and **every layer is gated on `prefers-reduced-motion`** (a foundational
a11y principle of the project):

- **GSAP + DrawSVGPlugin** — the web background *spins itself on*: threads draw
  from 0 → full length with a randomised stagger. Lazy-imported (off the initial
  bundle), skipped entirely under reduced motion. → `WeaverBackground.tsx`
- **Motion** (`motion/react`, via `LazyMotion`) — editorial fade-lift reveals on
  headings / detail sidebar. → `components/motion/`
- **AutoAnimate** — the masonry feed reflows smoothly on save / hide / discovery
  instead of jump-cutting. → `MasonryFeed.tsx`
- **React `<ViewTransition>`** (native, `experimental.viewTransition`) — a feed
  thumbnail **morphs** into the detail hero (shared-element continuity).
- **Lenis** — smooth wheel scrolling for the long feed; touch stays native.
- **tsParticles** (slim) — ambient "silk motes" with faint linking threads;
  desktop-only, low-count, fps-capped. → `SilkMotes.tsx`
- First-paint masonry is measured in a **layout effect** and held behind a
  skeleton until sized, then tiles **weave in** staggered — no column-reflow flash.

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000 (PORT env to override)
npm run build      # production build (type-checked)
```

Environment lives in `.env.local` (gitignored): Supabase URL + keys, the HF
`EMBED_ENDPOINT`/`EMBED_TOKEN`, and optionally `WEAVER_PASSCODE` (single-user
gate), `CRON_SECRET`, and Pinterest credentials.

## Documentation

- [DEPLOY.md](DEPLOY.md) — Vercel + GitHub Actions cron deploy, env vars, and the
  Supabase migration checklist (apply `0001…0015` in the SQL editor).
- [weaver-discovery-spec.md](weaver-discovery-spec.md) — the v2 discovery model.
- [weaver-spec-v1.1.md](weaver-spec-v1.1.md) — the base product spec.
- [AGENTS.md](AGENTS.md) — note for AI agents working in this repo.
