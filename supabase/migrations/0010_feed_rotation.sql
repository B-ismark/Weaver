-- Weaver — feed rotation (fixes "the same images show every visit").
--
-- The data is duplicate-free; the complaint is that the deterministic top-N
-- ranker surfaces the exact same favourites on every load, so the feed feels
-- stale. This adds a per-row score JITTER: each candidate's score is multiplied
-- by a random factor in [0.75, 1.0], so the within-cluster ranking (and thus the
-- exploited set) reshuffles every request while still being strongly taste-
-- biased (high scorers stay likely to appear). Combined with the existing
-- exploration slice, the feed feels fresh each visit without going random.
--
-- Same signature/filters as 0007; only `scored`/`ranked` gain the jitter.

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
  scored as (
    select
      p.id,
      greatest(
        coalesce((select max(1 - (p.embedding <=> c.v)) from cents c), 0),
        coalesce((select max(1 - (p.embedding <=> k.v)) from pos k), 0)
      ) as score,
      (select c.id from cents c order by p.embedding <=> c.v limit 1) as best_cent,
      -- per-row jitter, evaluated once here so ranking/ordering stay consistent
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
  select i.*
  from items i
  join combined cb on i.id = cb.id
  order by cb.pos;
$$;
