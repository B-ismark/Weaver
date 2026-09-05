-- Weaver — cache discovery-candidate thumbnails in our own storage (image-cache
-- plan, Phase 1). Candidates today hotlink the source image straight into
-- next/image as `unoptimized` (imageHost.shouldOptimize only trusts *.supabase.co),
-- so every feed tile pays full source-CDN latency/weight and inherits whatever
-- rate-limiting/blocking that source does. A background sweep (see
-- src/discovery/cacheCandidates.ts) fetches each candidate's image once, downscales
-- it the same way the ingestion pipeline already does for imported items
-- (sharpThumbnail.ts), and rewrites thumb_url to our own storage — at which point
-- imageHost.shouldOptimize already treats it as optimizable, no component changes
-- needed.
--
-- Bookkeeping columns so the sweep can find pending rows and back off a source
-- that keeps failing instead of re-fetching it forever.
alter table items add column if not exists thumb_cached boolean not null default false;
alter table items add column if not exists thumb_cache_attempts int not null default 0;
alter table items add column if not exists thumb_cache_error text;

-- Anything whose thumb_url is already ours (imported items go through
-- sharpThumbnail.ts today) is cached by definition — backfill so the sweep
-- doesn't re-process rows that never needed it.
update items set thumb_cached = true
where thumb_url like '%.supabase.co%' and not thumb_cached;

-- The fill sweep's query: pending candidates, oldest first, capped attempts.
create index if not exists items_thumb_cache_pending_idx
  on items (created_at)
  where role = 'candidate' and not thumb_cached and not hidden;

-- Bump attempts/error atomically (avoids a read-modify-write race with the sweep
-- running as a simple loop over a batch).
create or replace function bump_thumb_cache_failure(item_id uuid, err text)
returns void
language sql
as $$
  update items
  set thumb_cache_attempts = thumb_cache_attempts + 1,
      thumb_cache_error = err
  where id = item_id;
$$;

-- ---------------------------------------------------------------------------
-- Retention: un-liked candidates are throwaway scroll content, not the training
-- signal — no reason to keep them (or their cached image) around indefinitely.
-- Liked items get promoted to role='taste' (see /api/signal) and are excluded
-- here by definition, so they're never evicted; that's the "liked photos last
-- longer, they train the algorithm" rule.
-- ---------------------------------------------------------------------------
create index if not exists items_candidate_retention_idx
  on items (created_at)
  where role = 'candidate' and not promoted;
