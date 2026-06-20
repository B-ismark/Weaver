-- Weaver — initial schema (Phase 0)
-- Postgres + pgvector on Supabase (§8, §10).
-- OpenCLIP ViT-B/32 image embeddings are 512-dimensional (§8.2).

create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- items: one row per ingested image (the normalized §4.5 shape + thumb + vector)
-- ---------------------------------------------------------------------------
create table if not exists items (
  id            uuid primary key default gen_random_uuid(),
  platform      text not null check (platform in ('pinterest','twitter','threads','instagram')),
  engagement    text not null check (engagement in ('saved','liked','retweeted')),
  image_url     text not null,            -- full-res source (hotlinked, may expire) §5.2
  thumb_url     text,                     -- cached ~400px WebP in storage §5.1
  thumb_width   int,                      -- resized thumb dims → masonry aspect ratio (no layout shift)
  thumb_height  int,
  source_link   text not null,            -- click-through to original §2
  caption       text not null default '',
  dedup_key     text,                     -- perceptual-hash identity, cross-source §types
  embedding     vector(512),              -- OpenCLIP ViT-B/32, L2-normalized §8.2
  engaged_at    timestamptz not null default now(),  -- when the user engaged
  created_at    timestamptz not null default now()   -- when Weaver ingested it
);

-- Dedup: collapse the same image saved on multiple platforms (§types DEDUP_NOTE).
create unique index if not exists items_dedup_key_uniq
  on items (dedup_key) where dedup_key is not null;

-- v1 scale is a few thousand items → exact cosine search is fast; NO ANN index
-- yet (§8.5). Add ivfflat/hnsw only if search latency becomes noticeable:
--   create index on items using hnsw (embedding vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- taste_centroids: k-means centroids of liked-image embeddings (§8.3 v1 ranker)
-- ---------------------------------------------------------------------------
create table if not exists taste_centroids (
  id          uuid primary key default gen_random_uuid(),
  centroid    vector(512) not null,
  size        int not null default 0,     -- items assigned to this cluster
  computed_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- engagement_events: per-item signals, logged from Phase 0 (§12).
-- Cannot be recovered retroactively → captured now for the parked ranker (§13).
-- ---------------------------------------------------------------------------
create table if not exists engagement_events (
  id          bigint generated always as identity primary key,
  item_id     text not null,              -- FeedItem id (placeholder ids allowed in Phase 0)
  type        text not null check (type in ('impression','click','save','dwell','dismiss')),
  value       double precision,           -- e.g. dwell milliseconds
  created_at  timestamptz not null default now()
);

create index if not exists engagement_events_item_idx on engagement_events (item_id);
create index if not exists engagement_events_type_idx  on engagement_events (type);
