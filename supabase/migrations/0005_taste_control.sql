-- Weaver — taste control: keywords + hide (Pinterest "interests" + "hide pin").
-- Keywords are CLIP text embeddings in the SAME space as images, so a typed
-- interest like "brutalist architecture" steers the image feed directly.

-- Hidden candidates are excluded from the feed (negative signal, "not my taste").
alter table items add column if not exists hidden boolean not null default false;
create index if not exists items_hidden_idx on items (hidden) where hidden;

-- User taste keywords: positive steer toward, negative push away.
create table if not exists taste_keywords (
  id         uuid primary key default gen_random_uuid(),
  text       text not null,
  polarity   text not null default 'positive' check (polarity in ('positive','negative')),
  embedding  vector(512),                 -- CLIP text-tower vector (§8.4)
  created_at timestamptz not null default now(),
  unique (text, polarity)
);

-- ---------------------------------------------------------------------------
-- feed_by_taste: rank candidates by nearest taste TARGET (centroids + positive
-- keywords), exclude hidden, and drop anything too close to a negative keyword.
-- ---------------------------------------------------------------------------
create or replace function feed_by_taste(match_count int default 60)
returns setof items
language sql stable
as $$
  with targets as (
    select centroid as v from taste_centroids
    union all
    select embedding as v from taste_keywords where polarity = 'positive' and embedding is not null
  ),
  neg as (
    select embedding as v from taste_keywords where polarity = 'negative' and embedding is not null
  )
  select i.*
  from items i
  where i.role = 'candidate'
    and not i.hidden
    and i.embedding is not null
    and (select count(*) from targets) > 0
    and not exists (
      -- too similar to a disliked concept → drop (threshold tuned for ViT-B/32)
      select 1 from neg where (1 - (i.embedding <=> neg.v)) > 0.26
    )
  order by (select max(1 - (i.embedding <=> t.v)) from targets t) desc
  limit match_count;
$$;

create or replace function items_like(target uuid, match_count int default 20)
returns setof items
language sql stable
as $$
  with t as (select embedding from items where id = target)
  select i.*
  from items i, t
  where i.id <> target
    and i.embedding is not null
    and t.embedding is not null
    and i.role = 'candidate'
    and not i.hidden
  order by i.embedding <=> t.embedding
  limit match_count;
$$;

create or replace function search_items(query text, match_count int default 40)
returns setof items
language sql stable
as $$
  select i.*
  from items i
  where i.embedding is not null
    and i.role = 'candidate'
    and not i.hidden
  order by i.embedding <=> (query::vector(512))
  limit match_count;
$$;
