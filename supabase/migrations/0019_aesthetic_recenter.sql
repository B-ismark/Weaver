-- Weaver — recalibrate the aesthetic rank nudge to the measured score scale.
--
-- 0017 centered the aesthetic factor at 5 (assuming an AVA 1..10 scale). The
-- actual LAION ViT-B/32 linear predictor (sa_0_4_vit_b_32_linear) outputs a
-- LOWER range — measured on live data: min ~1.0, avg ~3.1, max ~5.3. Centering
-- at 5 meant almost everything got a mild penalty AND un-scored (NULL) rows —
-- treated as 5 — out-ranked freshly-scored ones, which is backwards.
--
-- Fix: center the factor at 3 (the observed median). NULL stays neutral (→3), a
-- top-scored image gets ~+11%, a bottom one ~-10% — a gentle, correctly-ordered
-- tie-breaker under the dominant taste score. Signature + everything else is
-- unchanged from 0017, so this is a CREATE OR REPLACE (idempotent).
--
-- NOTE on FEED_MIN_AESTHETIC: on this scale a floor of ~2.0 trims the bottom;
-- 0 = off. Do NOT use ~4.5 (that would empty the feed).

create or replace function feed_by_taste(
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
      and not (i.id = any(exclude_ids))
      and (min_aesthetic <= 0 or i.aesthetic is null or i.aesthetic >= min_aesthetic)
      and (i.seen_at is null or i.seen_at > now() - seen_grace_hours * interval '1 hour')
      and not exists (
        select 1 from neg where (1 - (i.embedding <=> neg.v)) > 0.26
      )
      and not exists (
        select 1 from items s
        where s.role = 'taste' and s.embedding is not null
          and (1 - (i.embedding <=> s.embedding)) > 0.92
      )
      and not exists (
        select 1 from items h
        where h.hidden and h.embedding is not null
          and (1 - (i.embedding <=> h.embedding)) > hide_similarity
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
      (0.75 + 0.25 * random()) as jit,
      -- centered at 3 (measured median); NULL → neutral. ±~10% tie-breaker.
      (1 + 0.05 * (coalesce(p.aesthetic, 3) - 3)) as aes_factor
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