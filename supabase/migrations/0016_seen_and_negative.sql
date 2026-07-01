-- Weaver — impression exclusion + negative "hide" signal.
--
-- Two feed changes on top of 0015:
--   1. IMPRESSION EXCLUSION. `seen_at` records when a candidate was FIRST shown
--      to the user (set by /api/impression, only when currently null). The feed
--      drops candidates first seen more than a grace window ago (6h) — so tiles
--      don't vanish mid-session, but content you scrolled past today is gone
--      tomorrow. This makes "new, nothing you've already seen" literally true,
--      not just for liked/hidden items.
--   2. NEGATIVE HIDE. Hiding an item ("not my taste") now suppresses FUTURE
--      candidates similar to it, not just that one tile: a candidate is excluded
--      if it's >0.85 cosine to ANY hidden item. So "not my taste" actually steers
--      the feed away from that style.
--
-- Everything else (score projection, diversity round-robin, exploration, per-row
-- rotation jitter) is unchanged from 0015. Return-type is identical, but we DROP
-- first to avoid leaving an ambiguous overload.

alter table items add column if not exists seen_at timestamptz;
create index if not exists items_seen_at_idx on items (seen_at);

drop function if exists feed_by_taste(int, float);
drop function if exists feed_by_taste(int);

create function feed_by_taste(match_count int default 60, explore_frac float default 0.2)
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
    select i.id, i.embedding
    from items i
    where i.role = 'candidate'
      and not i.hidden
      and i.embedding is not null
      and (select n from ntargets) > 0
      -- impression exclusion: drop candidates first seen > 6h ago
      and (i.seen_at is null or i.seen_at > now() - interval '6 hours')
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
          and (1 - (i.embedding <=> h.embedding)) > 0.85
      )
  ),
  scored as (
    select
      p.id,
      greatest(
        coalesce((select max(1 - (p.embedding <=> c.v)) from cents c), 0),
        coalesce((select max(1 - (p.embedding <=> k.v)) from pos k), 0)
      ) as score,
      (select c.id from cents c order by p.embedding <=> c.v limit 1) as best_cent,
      (0.75 + 0.25 * random()) as jit
    from pool p
  ),
  ranked as (
    select id, score, best_cent, (score * jit) as jscore,
      row_number() over (partition by best_cent order by score * jit desc) as rn_cent
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
