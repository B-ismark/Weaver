-- Weaver — feed polish (discovery spec §8, D3): diversity + exploration.
--
-- Problem with the §8.3 max-cosine ranker: the top N candidates can all cluster
-- around one strong centroid → the feed reads as a single monotonous interest,
-- and there's zero serendipity (purely exploitative).
--
-- This rewrite keeps the negative + already-seen filters from 0006, then:
--   1. DIVERSITY — assign each candidate to its nearest centroid and round-robin
--      across centroids (rank-1 of every cluster, then rank-2, …) so no single
--      cluster dominates. Serves every distinct interest, not just the loudest.
--   2. EXPLORATION — reserve `explore_frac` of the slots for randomized, still-
--      relevant picks (score floored so it's serendipity, not noise), interleaved
--      evenly through the feed rather than dumped at the end.
--
-- VOLATILE (was STABLE): random() means each refresh surfaces a fresh slice.
-- Signature adds explore_frac with a default → existing callers are unaffected.
-- Drop the 0006 single-arg version first: otherwise a one-arg call (match_count
-- only) is ambiguous between it and this defaulted two-arg form ("not unique").

drop function if exists feed_by_taste(int);

create or replace function feed_by_taste(match_count int default 60, explore_frac float default 0.2)
returns setof items
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
  -- candidate pool: unseen, not hidden, not near a disliked concept (0006 filters)
  pool as (
    select i.id, i.embedding
    from items i
    where i.role = 'candidate'
      and not i.hidden
      and i.embedding is not null
      and (select n from ntargets) > 0
      and not exists (
        select 1 from neg where (1 - (i.embedding <=> neg.v)) > 0.26
      )
      and not exists (
        select 1 from items s
        where s.role = 'taste' and s.embedding is not null
          and (1 - (i.embedding <=> s.embedding)) > 0.92
      )
  ),
  -- score = best match across centroids + positive keywords; best_cent = nearest cluster
  scored as (
    select
      p.id,
      greatest(
        coalesce((select max(1 - (p.embedding <=> c.v)) from cents c), 0),
        coalesce((select max(1 - (p.embedding <=> k.v)) from pos k), 0)
      ) as score,
      (select c.id from cents c order by p.embedding <=> c.v limit 1) as best_cent
    from pool p
  ),
  -- rank within each cluster so we can round-robin across clusters
  ranked as (
    select id, score, best_cent,
      row_number() over (partition by best_cent order by score desc) as rn_cent
    from scored
  ),
  n as (
    select
      ceil(match_count * (1 - explore_frac))::int as n_exploit,
      match_count - ceil(match_count * (1 - explore_frac))::int as n_explore
  ),
  -- EXPLOIT: round-robin across centroids (rank-1 everywhere, then rank-2, …)
  exploit as (
    select id, (row_number() over (order by rn_cent asc, score desc) - 1) as r
    from ranked
    order by rn_cent asc, score desc
    limit (select n_exploit from n)
  ),
  -- EXPLORE: randomized relevant picks from what exploit didn't take.
  -- random() materialized once per row so r matches the chosen order.
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
  -- interleave: spread explore picks evenly between exploit picks by position key
  combined as (
    select id, (r::float / greatest((select n_exploit from n), 1)) as pos
    from exploit
    union all
    select id, ((r + 0.5) / greatest((select n_explore from n), 1)) as pos
    from explore
  )
  select i.*
  from items i
  join combined cb on i.id = cb.id
  order by cb.pos;
$$;
