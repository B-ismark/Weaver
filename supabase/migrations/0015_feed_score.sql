-- Weaver — surface the taste-match SCORE to the UI (taste-match indicator).
--
-- feed_by_taste / items_like already compute a cosine relevance internally but
-- returned `setof items`, so the score was thrown away. This redefines both to
-- `returns table(<the columns the feed UI reads> , score real)` — the raw cosine
-- taste match in [0,1] — so a tile can show HOW strongly it matches (a woven gold
-- strength thread), and "more like this" can order/label by similarity.
--
-- Return type changes → CREATE OR REPLACE can't do it; must DROP first. Dropping
-- every existing signature (0006 one-arg, 0007/0010 two-arg) avoids leaving an
-- ambiguous overload behind. Logic is otherwise identical to 0010 (jittered
-- rotation + diversity + exploration); only the projection gains `score` (the
-- RAW, un-jittered cosine, so the badge reflects true taste match, not the
-- per-request shuffle).

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

-- ---------------------------------------------------------------------------
-- items_like: nearest neighbours + their cosine similarity as `score`.
-- ---------------------------------------------------------------------------
drop function if exists items_like(uuid, int);

create function items_like(target uuid, match_count int default 20)
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
language sql stable
as $$
  with t as (select embedding from items where id = target)
  select
    i.id, i.platform, i.image_url, i.thumb_url, i.thumb_width, i.thumb_height,
    i.source_link, i.caption,
    (1 - (i.embedding <=> t.embedding))::real as score
  from items i, t
  where i.id <> target
    and i.embedding is not null
    and t.embedding is not null
  order by i.embedding <=> t.embedding
  limit match_count;
$$;
