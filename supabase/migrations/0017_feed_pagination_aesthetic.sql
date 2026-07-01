-- Weaver — feed pagination + aesthetic quality signal.
--
-- Three additions on top of 0016, all backward-compatible (defaults preserve
-- prior behaviour; the return type is unchanged, so items.ts keeps working):
--
--   1. AESTHETIC SCORE. A new `items.aesthetic` column (0..10, LAION aesthetic
--      predictor run on the SAME CLIP embedding we already compute — see
--      hf-space/app.py). NULL for rows embedded before this migration; the feed
--      treats NULL as "unknown, don't penalise". Two uses below:
--        - `min_aesthetic` (default 0 = off): hard floor, drops junk below it but
--          NEVER drops NULLs (so the feed doesn't empty until re-embed catches up).
--        - a gentle multiplicative rank nudge so, among equally on-taste items, the
--          better-looking ones surface first. The DISPLAYED `score` stays the pure
--          taste cosine (honest match %); only the internal sort order is nudged.
--
--   2. SESSION PAGINATION. `exclude_ids` (default '{}') lets "load more" ask for
--      the next page without repeating tiles already shown THIS session. Composes
--      with the per-call randomisation (which otherwise makes offset paging show
--      dupes/gaps). Cross-session freshness is still handled by seen_at grace.
--
-- Everything else (diversity round-robin, exploration, jitter, seen exclusion,
-- negative hide, negative keywords) is unchanged from 0016. DROP first to avoid
-- leaving an ambiguous overload.

alter table items add column if not exists aesthetic real;

drop function if exists feed_by_taste(int, float);
drop function if exists feed_by_taste(int);
drop function if exists feed_by_taste(int, float, float, float);

create function feed_by_taste(
  match_count int default 60,
  explore_frac float default 0.2,
  seen_grace_hours float default 6,
  hide_similarity float default 0.85,
  exclude_ids uuid[] default '{}',
  min_aesthetic float default 0
)
returns table (
  id uuid,
  platform text,
  image_url text,
  thumb_url text,
  thumb_width int,
  thumb_height int,
  source_link text,
  caption text,
  score real
)
language sql volatile
as $$
  with cents as (
    select id, centroid as v from taste_centroids
  ),
  pos as (
    select embedding as v from taste_keywords where polarity = 'positive' and embedding is not null
  ),
  neg as (
    select embedding as v from taste_keywords where polarity = 'negative' and embedding is not null
  ),
  ntargets as (
    select (select count(*) from cents) + (select count(*) from pos) as n
  ),
  pool as (
    select i.id, i.embedding, i.aesthetic
    from items i
    where i.role = 'candidate'
      and not i.hidden
      and i.embedding is not null
      and (select n from ntargets) > 0
      -- session pagination: skip tiles already shown this session
      and not (i.id = any(exclude_ids))
      -- quality floor: drop known-low-aesthetic, but never drop unknown (NULL)
      and (min_aesthetic <= 0 or i.aesthetic is null or i.aesthetic >= min_aesthetic)
      -- impression exclusion: drop candidates first seen > grace ago
      and (i.seen_at is null or i.seen_at > now() - seen_grace_hours * interval '1 hour')
      -- negative keywords (taste page)
      and not exists (
        select 1 from neg where (1 - (i.embedding <=> neg.v)) > 0.26
      )
      -- already in the taste set (near-dup of something imported/saved)
      and not exists (
        select 1 from items s
        where s.role = 'taste' and s.embedding is not null
          and (1 - (i.embedding <=> s.embedding)) > 0.92
      )
      -- negative hide: suppress anything similar to what you rejected
      and not exists (
        select 1 from items h
        where h.hidden and h.embedding is not null
          and (1 - (i.embedding <=> h.embedding)) > hide_similarity
      )
  ),
  scored as (
    select
      p.id,
      -- DISPLAYED score = pure taste cosine (max over centroids + positive keywords)
      greatest(
        coalesce((select max(1 - (p.embedding <=> c.v)) from cents c), 0),
        coalesce((select max(1 - (p.embedding <=> k.v)) from pos k), 0)
      ) as score,
      (select c.id from cents c order by p.embedding <=> c.v limit 1) as best_cent,
      (0.75 + 0.25 * random()) as jit,
      -- gentle quality nudge: aesthetic 5 = neutral (×1), 10 ≈ ×1.25, 0 ≈ ×0.75.
      -- NULL (unknown) = neutral so un-scored rows aren't penalised.
      (1 + 0.05 * (coalesce(p.aesthetic, 5) - 5)) as aes_factor
    from pool p
  ),
  ranked as (
    select id, score, best_cent, (score * jit * aes_factor) as jscore,
      row_number() over (partition by best_cent order by score * jit * aes_factor desc) as rn_cent
    from scored
  ),
  n as (
    select
      ceil(match_count * (1 - explore_frac))::int as n_exploit,
      match_count - ceil(match_count * (1 - explore_frac))::int as n_explore
  ),
  exploit as (
    select id, (row_number() over (order by rn_cent asc, jscore desc) - 1) as r
    from ranked
    order by rn_cent asc, jscore desc
    limit (select n_exploit from n)
  ),
  explore_base as (
    select id, random() as rnd
    from ranked
    where id not in (select id from exploit)
      and score > 0.15
  ),
  explore as (
    select id, (row_number() over (order by rnd) - 1) as r
    from explore_base
    order by rnd
    limit (select greatest(n_explore, 0) from n)
  ),
  combined as (
    select id, (r::float / greatest((select n_exploit from n), 1)) as pos
    from exploit
    union all
    select id, ((r + 0.5) / greatest((select n_explore from n), 1)) as pos
    from explore
  )
  select
    i.id, i.platform, i.image_url, i.thumb_url, i.thumb_width, i.thumb_height,
    i.source_link, i.caption, rk.score::real as score
  from items i
  join combined cb on i.id = cb.id
  join ranked rk on rk.id = i.id
  order by cb.pos;
$$;
