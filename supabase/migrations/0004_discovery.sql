-- Weaver — discovery feed model split (v2 D0, weaver-discovery-spec.md §2/§11).
-- Items now have a role: 'taste' (your imports, signal only, hidden from feed)
-- vs 'candidate' (discovered external content, the actual feed).

alter table items add column if not exists role text not null default 'taste'
  check (role in ('taste', 'candidate'));
alter table items add column if not exists taste_score real;          -- cosine to nearest centroid
alter table items add column if not exists promoted boolean not null default false;
alter table items add column if not exists last_shown_at timestamptz;

-- Candidates have no engagement signal and come from discovery sources, so widen
-- the platform check and allow null engagement.
alter table items alter column engagement drop not null;
alter table items drop constraint if exists items_platform_check;
alter table items add constraint items_platform_check
  check (platform in ('pinterest','twitter','threads','instagram','reddit','arena','unsplash','openverse'));

create index if not exists items_role_score_idx on items (role, taste_score desc);

-- ---------------------------------------------------------------------------
-- Rescope the RPCs to the discovery feed: rank CANDIDATES by taste, not the
-- user's own library. Centroids still come from taste items (unchanged).
-- ---------------------------------------------------------------------------

create or replace function feed_by_taste(match_count int default 60)
returns setof items
language sql stable
as $$
  select i.*
  from items i
  cross join taste_centroids c
  where i.embedding is not null
    and i.role = 'candidate'
  group by i.id
  order by max(1 - (i.embedding <=> c.centroid)) desc
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
  order by i.embedding <=> (query::vector(512))
  limit match_count;
$$;
