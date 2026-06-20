# Weaver — Project Specification (v1.1)

*A Pinterest-style personal aggregator that pulls images you've engaged with across your own accounts, learns your taste, and presents them in a unified, browsable feed.*

**Status:** v1.1 specification (build scope)
**Last updated:** June 2026

> v1.1 changelog vs v1: images-only ingestion for all platforms; thumbnail-caching added at ingest; live CLIP text-encoding host pinned to HF Spaces; clustered taste centroids promoted to v1 default; scheduled aggregation jobs dropped in favor of manual import; engagement logging moved to early phases; sentence-transformers and learned ranker removed from build scope (see §12 Parked); added §0 Engineering Foundations; noted Pinterest export ~48h SendSafely delay (§6.5); added explicit dedup stage (§11).

---

## 0. Engineering Foundations (non-negotiable)

Every implementation decision — across frontend, ingestion, and AI — must uphold these five. They are the foundation of the project, not polish applied later.

1. **Component-based** — UI is built from small, single-responsibility, reusable components. No monolith screens. Composition over duplication.
2. **Modularity** — concerns are isolated behind clear interfaces (e.g. the source-agnostic ingestion ports, §4.5). Swapping a source, model, or store never ripples outward.
3. **Responsiveness** — mobile-first, fluid across phone → desktop. The PWA must feel native on a phone; the masonry feed reflows cleanly at every breakpoint.
4. **Accessibility (a11y)** — semantic HTML, keyboard navigability, ARIA where needed, sufficient contrast, focus management, alt text on every image. Target WCAG 2.1 AA.
5. **Efficiency** — lazy-load, cache, and normalize aggressively. Thumbnails over full-res in the grid (§5), batched embeddings (§8.7), exact-but-cheap vector search at this scale (§8.5). Minimize bytes, renders, and round-trips.

**When a detail is uncertain** (a11y pattern, responsive technique, library API, platform format) — **research it (current docs / web) before implementing. Do not guess.**

---

## 1. Project Overview

### What it is
A single-user application that aggregates **images** the user has already engaged with across their own social accounts (Pinterest, Twitter/X, Threads, Instagram), learns the user's taste from those engagement signals, and surfaces both that content and visually/semantically similar content in a Pinterest-style feed. Tapping any item links back to the original source.

### What it is not
Not a general-purpose social product or a Pinterest competitor. Single-user, personal-use aggregator. Value is *consolidation plus smarter curation* across platforms the user already uses — not network effects.

### Core goals
1. Pull the user's own engagement signals (likes, saves, retweets) from each platform.
2. Build a "taste profile" from those signals using open-source AI.
3. Present a unified, Pinterest-like feed ranked to the user's taste.
4. Support "more like this" and semantic text search.
5. Run on a $0 infrastructure budget.

### Non-goals (v1)
- No multi-user accounts or sharing.
- No content creation or posting back to platforms.
- No real-time sync — refresh is **manual** (§7).
- No ingestion of post text/captions as a content type — **images only** (§3).

---

## 2. Interface & Experience Model

Interface and flows mirror **Pinterest**.

### Key screens / flows
1. **Home feed** — masonry (staggered) grid of images, ranked by similarity to the taste profile. Infinite scroll.
2. **Detail view** — tap an image to enlarge, see source platform + caption, follow link to original.
3. **"More like this"** — from detail view, surface visually/semantically similar items.
4. **Search** — text search bar returning images semantically (e.g. "minimalist photography," "film posters").
5. **Source-out** — every item links back to its original URL on the source platform.

### Design principles
- Masonry grid as primary layout (`react-masonry-css` or equivalent).
- Blur-up / low-quality placeholders so the feed feels instant while images load.
- **Cached thumbnails** render in the grid; full-resolution hotlinked only on detail view / click-through (§5).

---

## 3. Data Sources & Signals

**Images only.** For every platform Weaver ingests the *image* attached to an engaged item — not the post text, tweet body, or caption-as-content. Captions are kept only as display metadata on the detail view.

Build order: start with the friendliest source, end with the most restrictive.

| Priority | Platform | Engagement signal | API friendliness |
|----------|----------|-------------------|------------------|
| 1 | Pinterest | Liked / saved pins | Good — usable free API |
| 2 | Twitter / X | Images from reposts / retweets | Poor — read access paywalled → export-only |
| 3 | Threads | Images from liked posts | Limited — newer API, posting-oriented |
| 4 | Instagram | Images from liked posts | Restrictive — Graph API, own-account only |

### Signal definitions (locked)
- **Pinterest:** images from items the user *liked / saved*
- **Twitter/X:** images from items the user *reposted / retweeted*
- **Threads:** images from items the user *liked*
- **Instagram:** images from items the user *liked*

Items with no usable image are skipped at ingestion.

---

## 4. Data Access Strategy

Infrastructure is free; *data sourcing* is the real risk. Each platform restricts access on purpose. Strategy sequences from safest to most fragile.

### 4.1 Data export — primary, safest path
Every platform must let the user download their own data. Build an importer that ingests export archives (likes, saved pins, retweets) instead of relying on live APIs.
- **Pros:** 100% within terms of service, $0, works for every platform including Twitter.
- **Cons:** manual, periodic, variable formats (JSON or URL lists).
- **Verdict:** this alone can power v1.

### 4.2 Official APIs at free limits — supplement
- **Pinterest:** genuinely usable free API for saved pins and boards. Start here.
- **Instagram Graph API:** works for owned accounts, limited, requires setup.
- **Threads API:** official (2024), posting-oriented; verify what liked content it exposes.
- **Twitter/X:** free tier is post-only. Treat as **export-only**.

### 4.3 Out of scope for sourcing
- RSS / feed bridges — coverage too spotty to rely on.
- Scraping (Puppeteer/Playwright) — violates terms, breaks on markup change, risks account flagging. Not used.

### 4.4 Recommended v1 sourcing strategy
Lead with **data exports + Pinterest API**. Twitter is export-only. Add Instagram/Threads API access as a stretch once the core loop works.

### 4.5 Core architectural principle — source-agnostic ingestion
> The ingestion layer accepts **normalized content** — `{ image_url, source_link, caption, engagement_signal, platform, timestamp }` — regardless of whether it came from an API or an export file.

This isolates the API mess. Adding, swapping, or removing a source never touches the algorithm or frontend.

---

## 5. Image Storage & Delivery

Platform CDN URLs are frequently signed, expiring, and referrer-locked. Pure hotlinking rots the feed within days. Strategy:

### 5.1 Thumbnails — cached (authoritative)
At ingestion, fetch each image once, downscale to ~400px-wide **WebP** (~15–30 KB), and store the bytes in Supabase storage. The grid feed renders these cached thumbnails. They survive CDN URL expiry and load fast.

### 5.2 Full-resolution — hotlinked, lazy
On detail view, hotlink the original CDN URL for full-res. On 403 / expired link, fall back to the "open original" source-out link (§2). Full-res is never cached.

### 5.3 Storage budget
At a few-thousand-item scale, thumbnails total ~75–100 MB — well under the Supabase 1 GB free cap. Re-check if the library grows past ~30k items.

### 5.4 Image quality caveat to verify early
Some platform APIs/exports return compressed or downsized images. The thumbnail strategy is unaffected, but full-res quality depends on what each platform exposes. **Verify per-platform during ingestion build** (§11 Q1).

---

## 6. Account Connection & Authentication

Ideal UX: "log in once per platform, app pulls your data." Partially achievable. OAuth login works everywhere; the limiting factor is **what each platform's scopes expose after authentication** — not the login.

### 6.1 The mechanism — OAuth
"Log in with Pinterest" (etc.) is OAuth: user is redirected to the platform, authenticates there, grants a scoped token. App never sees the password. This is the legitimate way to fetch the user's own content via in-app login.

### 6.2 Per-platform reality

| Platform | In-app OAuth login | What it actually unlocks | Verdict |
|----------|--------------------|--------------------------|---------|
| **Pinterest** | Works | The user's pins and boards | **Realistic** — smooth "log in → fetch saves" |
| **Instagram** | Works | Narrow scopes, oriented to own posts, not full like history | **Partial** — granted data thinner than desired |
| **Threads** | Works | Official API, posting-oriented; liked-content access uncertain | **Partial** — verify scope coverage |
| **Twitter/X** | Works | Reading retweets at scale sits behind the **paid** tier | **Login ≠ free data** — export-only |

**Key insight:** for Instagram, Threads, and Twitter the restriction is *not* authentication. The user can log in and still not get full data, because the scope limits (or paywalls) what is exposed. Login solves *who*, not *how much*.

### 6.3 Why exports remain the fallback
Data exports sidestep scope limits: the platform is legally obligated to hand over **all** the user's own data regardless of what the API exposes. Where OAuth comes up short, the export importer fills the gap.

### 6.4 v1 connection model — hybrid
- **Pinterest:** OAuth login → live fetch.
- **Instagram / Threads:** OAuth where it grants something useful; supplement with export import.
- **Twitter/X:** export import only.

Because of the source-agnostic ingestion layer (§4.5), OAuth-fetched and export-file content arrive in the same normalized format. The connection screen can mix "Connect via login" and "Import export file" per platform transparently.

### 6.5 Setup caveat — app review
Most OAuth APIs require the developer's app to pass platform **app review** before real users connect, and some restrict to test accounts until approved. For a personal, single-user app this is usually fine (the user is their own test account) but it is a **setup step, not instant** — budget time per platform (§11 Q4).

**Export delay caveat (Pinterest, verified):** the official data export is not instant either. Request via Settings → Privacy & data → *Request your data*; Pinterest emails a download link via its provider **SendSafely**, typically up to **~48 hours** later. The archive is a **ZIP of JSON + CSV files plus images**. Pinterest does not publish the export schema and field names vary by version — the importer extracts tolerantly (see `parsers/pinterest.ts`). Budget this turnaround into any first-run plan.

---

## 7. Refresh Model — Manual

Refresh is **manual / on-demand**. The user triggers an import (re-upload an export, or re-pull the Pinterest API) from a button or script.

Rationale:
- Exports are manual anyway (monthly re-download).
- Avoids Supabase free-tier auto-pause (~1 week inactivity) silently killing scheduled jobs.
- Removes the need for scheduled aggregation infrastructure (no Cloudflare Workers / Edge cron in v1).

Ingestion is therefore a process the user runs, not an always-on system.

---

## 8. AI Approach

All AI is open-source, runs on the user's own compute — $0 in services. One core mechanism (image embeddings) covers feed ranking, "more like this," and search.

### 8.1 What the Pinterest UX demands
| Job | Technique |
|-----|-----------|
| Home feed ranking | Score new items by similarity to taste profile |
| "More like this" | Nearest-neighbor lookup on a tapped item |
| Search | Embed the text query into the same vector space as images |

### 8.2 Core pathway — image embeddings with OpenCLIP
Every image is converted to a vector and stored in **pgvector**. This single mechanism powers all three jobs.
- Use **OpenCLIP** over base CLIP — better performance, fully open, multiple model sizes.
- CLIP is **multimodal**: text and images share one vector space. This gives **semantic search for free** — a text query like "minimalist photography" finds matching images with **no manual tagging**.
- **Model:** OpenCLIP **ViT-B/32** is the v1 default — small enough to embed a few thousand images quickly on CPU/Colab, and its text tower is small enough to host live (§9).
- **Normalize:** store L2-normalized vectors so cosine similarity = dot product (faster in pgvector).

### 8.3 Taste profile — clustered centroids (v1 default)
A single averaged taste vector blurs distinct interests (landscape photography *and* film posters *and* quote graphics) into a mush vector pointing at nothing. So v1 ships clustering directly:
- Cluster the user's liked-image embeddings with **k-means** into several **taste centroids**.
- Score new content against its **nearest centroid**, not the global average.
- The feed serves all distinct interests instead of a bland average. No heavy ML, no training.

(An averaged-vector mode may be used for a one-day sanity check during Phase 2 but is not the shipped ranker.)

### 8.4 Search — CLIP text-to-image
A text query is embedded by the CLIP **text tower** into the same space and matched against image vectors via cosine similarity in pgvector. Live text-encoding host is defined in §9.

### 8.5 Vector index
At a few-thousand-item scale, pgvector **exact search** runs in milliseconds. **No HNSW/ivfflat index in v1** — add one only if search latency becomes noticeable as the library grows.

### 8.6 Explicitly out of scope for the core loop
- No hosted LLM / paid AI API — similarity ranking is not a generative task.
- No hand-built tagging taxonomy — CLIP's semantic space replaces it.

### 8.7 Compute note
The one real cost is **compute time** for generating image embeddings. Handle in batches on the user's own machine, or use a free tier such as Google Colab GPU for heavier initial passes. Free, but consumes the user's time and hardware, not an always-on hosted service.

---

## 9. Live Inference Host (Search)

Image embeddings are generated **offline in batch** (own machine / Colab) — no host needed. But the **search query** must embed text on-demand, server-side, every time. Serverless free tiers (Vercel / Cloudflare) cannot host the model — too large, cold starts fail.

**v1 host: Hugging Face Spaces (free tier)** running the quantized OpenCLIP ViT-B/32 **text tower** wrapped as a tiny API endpoint.
- Always reachable (unlike a local box behind a tunnel that must stay on).
- Text tower alone is small (~250 MB, quantizes smaller).
- Cold-start lag (~10–20 s on first query after idle) is acceptable for personal search.

**Fallback if cold-start lag is annoying:** precompute embeddings for a fixed list of ~20 common search phrases ("minimalist," "film posters," etc.) and match against those instantly with no live model. Covers most personal use.

---

## 10. Technical Stack

| Layer | Choice | Notes / $0 status |
|-------|--------|-------------------|
| Frontend (PWA + web) | **Next.js + React**, **Tailwind** | One codebase for web + installable PWA. SSR + `next/image` (responsive sizing, lazy load, WebP/AVIF). |
| Mobile | **PWA first** (installable) | React Native / Expo only if needed later. Reuses the web codebase. |
| Grid layout | `react-masonry-css` (or equivalent) | Pinterest-style staggered grid. |
| Backend | **Supabase** (Postgres, storage, auth) | Free tier: 500 MB Postgres, 1 GB storage, pgvector included. |
| Vector store / ranking | **Postgres + pgvector** | Image embeddings; exact cosine search (no index in v1). Inside Supabase. |
| Thumbnail cache | **Supabase storage** | ~400px WebP thumbs cached at ingest (§5). |
| Image delivery | **Cached thumbs in grid; hotlink full-res on detail** | Avoids paid image services. Graceful fallback to source link on 403. |
| Ingestion | **Manual import script / endpoint** | Export importer + Pinterest API pull. No scheduled jobs in v1 (§7). |
| Live text-encoding | **Hugging Face Spaces (free)** | Quantized OpenCLIP ViT-B/32 text tower for search (§9). |
| Image embeddings | **OpenCLIP ViT-B/32** | Run offline on own compute / free Colab. |
| Hosting | **Vercel** or **Cloudflare Pages** | Free PWA hosting. |

### Free-tier caveats to track
- **Supabase free tier pauses** after ~1 week of inactivity. Manual-refresh model (§7) sidesteps job failures; first load after a pause may be cold.
- **Image quality ceiling:** full-res depends on what each platform's API/export exposes — some return compressed versions. Verify per-platform early (§5.4).
- **Twitter/X API** is the main place reality might charge money — mitigated by the export-only strategy (§4).

---

## 11. High-Level Architecture Flow

```
[Platform exports + Pinterest API]
        │  (source-agnostic ingestion — §4.5; manual trigger — §7)
        ▼
[Normalize → { image_url, source_link, caption, signal, platform, timestamp }]
        │  (skip items with no usable image — §3)
        ▼
[Ingest step: fetch image → cache ~400px WebP thumb in Supabase storage — §5]
        ▼
[Dedup: perceptual hash (pHash) of cached thumb → cross-source identity; collapse duplicates]
        │  (runs AFTER caching — pHash needs normalized thumbnail bytes)
        ▼
[Embedding generation: OpenCLIP ViT-B/32 (images), batched, own compute / Colab — §8.2]
        ▼
[Store in Supabase Postgres + pgvector (L2-normalized)]
        │
        ├── Taste profile: k-means clustered centroids — §8.3
        │
        ▼
[Ranking + search: exact cosine similarity in pgvector — §8.5]
        │     (search query embedded live via HF Spaces text tower — §9)
        ▼
[Next.js PWA → masonry feed, detail view, "more like this", search]
        │
        ▼
[Click-through to original source]
        │
        └── (logs engagement events from Phase 1 — §12 prerequisite)
```

---

## 12. Build Phases (v1 scope)

1. **Phase 0 — Foundations:** Next.js PWA shell + Supabase + pgvector. Masonry grid rendering placeholder data. **Stand up the engagement-event log table now** (save / click / dwell / dismiss) so data accrues from day one.
2. **Phase 1 — Pinterest ingestion:** Pinterest OAuth login + export importer through the source-agnostic layer (§4.5, §6). Thumbnail caching at ingest (§5). Real images in the feed. Wire engagement logging to the feed/detail interactions.
3. **Phase 2 — Core AI:** OpenCLIP ViT-B/32 image embeddings + pgvector storage + **clustered taste-centroid ranking** (§8.3) + "more like this." Stand up the HF Spaces text-tower endpoint and ship semantic search (§9).
4. **Phase 3 — More sources:** Twitter (export, images only), then Threads, then Instagram — all through the same normalized ingestion and thumbnail-caching path.

> **Engagement logging is not deferred.** It is built in Phase 0–1 because per-item events (save/click/dwell/dismiss) cannot be recovered retroactively, and they are the prerequisite data for anything parked in §13.

---

## 13. Parked (not part of this build)

Listed by name only, for scope clarity. Not specified or built in v1:

- **Learned ranker** — a lightweight gradient-boosted model trained on engagement events to move ranking from similarity toward learned preference.
- **sentence-transformers / text-as-content** — embedding post text/captions as a searchable content type (v1 is images-only).
- **Auto-captioning** — a small vision-language model to generate extra image metadata.
- **Scheduled / real-time sync** — automated periodic pulls (v1 is manual refresh).
- **Multi-user, sharing, posting-back.**

---

## 14. Open Questions to Resolve Before / During Building

1. Per-platform: what image resolution does each export/API actually expose? (Affects the high-quality full-res goal — §5.4.)
2. Storage headroom — at what library size do cached thumbnails threaten the 1 GB Supabase cap? (Re-check past ~30k items — §5.3.)
3. Per-platform OAuth scope check — confirm exactly what liked/retweeted image content each platform's scopes return *before* relying on login over export (§6.2).
4. App-review timeline — how long does each platform's developer app approval take, and is a personal app exempt or test-account-limited? (§6.5)
5. HF Spaces cold-start — is first-query lag acceptable in practice, or is the precomputed-phrase fallback needed? (§9)
```
