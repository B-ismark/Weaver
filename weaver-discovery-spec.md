# Weaver — Discovery Feed (v2 specification)

*The pivot: stop regurgitating what you've already seen. Use your cross-platform engagement as a **taste signal**, and fill the feed with **new content you haven't seen**, ranked to that taste.*

**Status:** v2 spec (supersedes the feed model in [weaver-spec-v1.1.md](weaver-spec-v1.1.md) §2/§6; ingestion, embeddings, pgvector, and the source-agnostic layer carry over unchanged)
**Last updated:** June 2026

---

## 1. Why this changes the core

v1 ranked **your own imported items** and showed them back to you. That's a consolidation tool, not a discovery tool — and re-surfacing pins you already saved has little value.

**The reframe:**
- **Imported engagement** (Pinterest saves, Twitter/Threads/IG likes) = the **taste profile**. Signal only. Never the feed.
- **The feed** = a stream of **new candidate images** pulled from external sources, **ranked by similarity to your taste**, that you have **not** already engaged with.
- **"More like this"** and **search** operate over the discovered candidate pool, not your library.

Everything technical we already built — OpenCLIP embeddings, taste centroids (§8.3), pgvector similarity, the source-agnostic ingestion ports — is reused. What changes is **what we embed and rank**: an external candidate pool, filtered by your centroids.

This makes the taste machinery the *filter*, and external sources the *volume*. CLIP + centroids do the curation; sources just supply raw images.

---

## 2. Two kinds of items (the central model change)

Every stored image now has a **role**:

| Role | Source | Shown in feed? | Purpose |
|------|--------|----------------|---------|
| `taste` | Your imports (Pinterest/Twitter/Threads/IG) | **No** — already seen | Builds taste centroids (§8.3) |
| `candidate` | External discovery sources (§4) | **Yes**, if it survives ranking | The actual feed |

- `taste` items are browsable in a secondary **"Your library"** view, but never in the main feed.
- `candidate` items are what the home feed serves. They are ranked against the centroids derived from `taste` items.
- A candidate the user **saves** is promoted: its embedding joins the taste set (§9), tightening the profile.

This is a one-column change to the existing `items` table (`role text`), plus a `candidates` lifecycle (§10). The source-agnostic ingestion contract (§4.6 of v1.1) already produces normalized items; we just tag role at ingest.

---

## 3. Architecture flow

```
[Your imports]──embed──> taste items ──k-means──> TASTE CENTROIDS
                                                       │
                                                       │ (the filter)
[Discovery sources §4]──pull──> candidate images       │
        │  (Are.na, Reddit, Unsplash, Openverse, …)    │
        ▼                                              │
[Normalize → source-agnostic layer (§4.6)]             │
        ▼                                              │
[Embed candidates: OpenCLIP ViT-B/32]                  │
        ▼                                              ▼
[Score each candidate = max cosine sim to any centroid]
        ▼
[Exclude already-seen (vs taste set + shown log) — §8]
        ▼
[Feed assembly: rank + diversity + exploration — §7]
        ▼
[Home feed: new, taste-matched, unseen images]
        ▼
[Engagement (save/click/dismiss) → refine taste — §9]
```

---

## 4. Candidate sources ($0, the hard part)

The genuinely hard problem: where do *new* images come from, free and within terms? Ranked by fit + friendliness.

| Source | Access | Aesthetic fit | Notes |
|--------|--------|---------------|-------|
| **Are.na** | Free API, token | **Excellent** | Curated visual "blocks", inherently taste-driven. Channels/connections mirror Pinterest boards. Top pick. |
| **Reddit** | Public `.json` endpoints, no auth | Good (subreddit-dependent) | r/Art, r/DesignPorn, r/photographs, r/ArchitecturePorn, etc. High volume, free. Respect rate limits + UA. |
| **Openverse** | Free API, no key | Good | CC-licensed images, clean to redistribute/cache. Keyword search. |
| **Unsplash / Pexels** | Free API tier (key) | Good (photography) | High quality, generous free tiers, keyword search. Attribution required. |
| **Pinterest related pins** | OAuth API (if exposed) | Excellent | Pinterest's own recommendation graph off your saves. Availability uncertain — verify scope. |
| **RSS (design blogs)** | Free | Niche | Colossal, Designmilk, etc. Low volume; supplement only. |

**Out of scope (same as v1.1 §4.3):** scraping. Fragile, ToS-violating.

**Recommended start:** **Are.na + Reddit JSON** (free, no/low auth, strong visual relevance), then **Openverse/Unsplash** for photography breadth. Each becomes a `CandidateSource` adapter that emits normalized items through the existing ingestion layer — adding a source never touches ranking or UI.

---

## 5. Matching taste → candidates (no text query required)

Centroids are **image vectors**; most sources search by **text**. Two ways to bridge:

- **5.1 Embedding-driven (primary).** Pull a broad candidate batch, embed every image, score by cosine similarity to the nearest centroid. Source-agnostic, needs no query, reuses everything. Cost: embedding many candidates (§10).
- **5.2 Seed-guided pull (efficiency bias).** To avoid embedding piles of irrelevant images, *seed* the pull with terms we already have: **board names** ("Photography", "Art", "Architecture" — present in the Pinterest export), top captions, and CLIP zero-shot labels of each centroid. Feed those as queries to keyword sources, then embed-rank the results. Cuts wasted embedding on off-taste pulls.

**Recommended: hybrid.** Seed-guided pull for relevance + embedding rank for precision. Embedding rank is the source of truth; seeds just steer where we look.

---

## 6. Candidate ingestion pipeline (reuses existing ports)

The v1 pipeline (`import → thumb-cache → dedup → embed → store`) extends with minimal change:

```
CandidateSource.pull(seeds) → normalized candidates
   → dedup vs SEEN (taste pHashes + shown log)   ← new: exclude already-engaged
   → embed (OpenCLIP)                              ← now MUST run inline/near-real-time
   → score vs centroids
   → store as role='candidate' (+ score, +source) ← thumb-cache only top-ranked (§10)
```

Two differences from taste ingestion:
1. **Dedup is against the seen-set**, not just within-batch — a candidate identical to something you already saved is not new.
2. **Embedding can't be deferred** — discovery ranking needs vectors now. Phase 2's offline batch model still works for backfill, but discovery needs an embedding service callable by the refresh job (the same HF Space / a worker, §9 of v1.1). This is a real compute consideration (§10).

---

## 7. Feed assembly — ranking, diversity, exploration

Pure "top by centroid similarity" collapses into a monotonous bubble. Feed = blend:

- **7.1 Exploitation (majority, ~70%).** Highest cosine similarity to nearest centroid — squarely your taste.
- **7.2 Diversity across centroids.** Round-robin the *interests*: serve from each centroid (landscape *and* film posters *and* type), not just the dominant one. Mirrors §8.3's multi-interest intent.
- **7.3 Exploration (~15-20%).** Deliberately include medium-similarity / different-source items so taste can *expand* and the feed doesn't stagnate. Tunable.
- **7.4 Freshness.** Prefer recently-pulled, not-yet-shown candidates; decay items shown-but-ignored.

Each rule is a cheap SQL/score adjustment over the candidate set — no heavy ML. The parked learned ranker (§7 of v1.1) is the eventual upgrade once enough engagement accrues.

---

## 8. "Already seen" — the exclusion set

A discovery feed is worthless if it shows what you've seen. Exclude a candidate when it matches:
- **Your taste set** — perceptual-hash (aHash, already built) collision with any imported item.
- **The shown log** — a lightweight `shown_events` (or reuse `engagement_events` `impression`) so the same candidate isn't re-served endlessly.
- **Dismissed items** — explicit "not interested" → hard-exclude + negative signal (§9).

pHash dedup (§types DEDUP_NOTE) already exists; this extends its scope from "within import" to "vs everything seen."

---

## 9. Feedback loop — taste that sharpens

Discovery gets better only if engagement feeds back:
- **Save / strong click on a candidate** → promote: copy its embedding into the taste set, flag `promoted_from_discovery`. Periodic re-clustering folds it into centroids → feed adapts.
- **Dismiss** → exclude + store negative signal (training data for the learned ranker, §7 v1.1).
- **Impression-only (shown, ignored)** → weak negative; decay its future priority.

All of this rides on the engagement events **already logged since Phase 0** (§12 v1.1) — the early instrumentation pays off here.

---

## 10. Storage & compute under $0 (the real constraints)

Discovery pulls volume → must stay inside free tiers.

- **10.1 Don't cache every candidate thumbnail.** Storage cap (Supabase 1GB) can't hold an unbounded candidate stream. **Thumb-cache only candidates that enter the shown feed** (top-ranked); for the rest store **URL + embedding only** (a 512-float vector ≈ 2KB — cheap). Hotlink their thumbnails until/unless promoted.
- **10.2 Cap pull + embed per refresh.** Embedding is the compute cost (§8.7 v1.1). Bound each refresh (e.g. ≤500 candidates) so a run is minutes, not hours. Run on own compute / Colab / a worker.
- **10.3 Prune.** Drop candidates that are: dismissed, shown-and-ignored past a threshold, older than N days, or below a score floor. Keeps the table bounded and the feed fresh.
- **10.4 Embedding service for discovery.** Unlike taste backfill (offline), discovery ranking needs embeddings during refresh. Options: extend the HF Space (§9 v1.1) to embed images too, or a scheduled worker with the model. Decide before building.

---

## 11. Data model changes

```sql
-- items: tag role; candidates carry a score + source + lifecycle
alter table items add column role text not null default 'taste'
  check (role in ('taste','candidate'));
alter table items add column source text;          -- 'arena','reddit','unsplash',...
alter table items add column taste_score real;      -- cosine to nearest centroid (candidates)
alter table items add column promoted boolean not null default false;
alter table items add column last_shown_at timestamptz;

-- feed = candidates, ranked, unseen
create index on items (role, taste_score desc);

-- 'seen' exclusion uses existing dedup_key (pHash) + engagement_events(impression/dismiss)
```

Ranking RPCs (§0003) gain a `role='candidate'` filter and the exclusion joins; `items_like`/`search_items` scope to candidates by default.

---

## 12. Build phases (discovery)

1. **D0 — Model split.** Add `role`; tag existing 148 Pinterest items as `taste`. Feed temporarily empty (no candidates yet) → clearly messaged.
2. **D1 — First source + embed-on-ingest.** Are.na (or Reddit JSON) `CandidateSource`; embed candidates inline; store with score. Feed shows real discovered, taste-ranked content.
3. **D2 — Exclusion + feedback.** Seen-set dedup (taste + shown), dismiss action, save→promote→re-cluster.
4. **D3 — Assembly polish.** Diversity across centroids + exploration slice (§7).
5. **D4 — More sources + pruning + scheduled refresh.** Add Openverse/Unsplash; lifecycle pruning (§10); cron pull.
6. **Later — Learned ranker** (§7 v1.1) once engagement volume justifies it.

---

## 13. Open questions / risks

1. **Embedding throughput for discovery** — can the free HF Space / worker embed ~500 imgs/refresh in acceptable time? (§10.4) Biggest feasibility risk.
2. **Source ToS for caching/redistribution** — Openverse (CC) is safe to cache; Unsplash/Pexels need attribution; Reddit/Are.na content is third-party — safest to **hotlink, not cache**, candidate thumbnails (aligns with §10.1). Verify per source.
3. **Cold start** — before centroids exist (no imports), discovery can't personalize. Fallback: source-popular / recent until taste forms.
4. **Filter bubble** — exploration slice (§7.3) is the mitigation; tune the ratio with real use.
5. **Candidate freshness vs cost** — how often to refresh, and Supabase free-tier pause (§8 v1.1) interacting with scheduled pulls.
6. **Quality of seed terms** — board names like "Art"/"Photography" are broad; do they steer pulls well, or is pure embedding-driven (5.1) better despite cost?
7. **Pinterest related-pins API** — does OAuth scope actually expose it? If yes, it's the highest-fit source and partly solves cold start.
```
