-- Weaver — "already seen" exclusion (discovery spec §8, D2).
-- A discovery candidate that's a near-duplicate of something in your taste set
-- (imported or saved) is something you've already seen → never show it.
-- Uses embedding cosine (no pHash needed): identical/near-identical images sit
-- at cosine ~0.92+. Threshold tuned to catch dupes without nuking lookalikes.

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
    -- not too close to a disliked concept
    and not exists (
      select 1 from neg where (1 - (i.embedding <=> neg.v)) > 0.26
    )
    -- not already seen: near-duplicate of any taste item (imported or saved)
    and not exists (
      select 1 from items s
      where s.role = 'taste' and s.embedding is not null
        and (1 - (i.embedding <=> s.embedding)) > 0.92
    )
  order by (select max(1 - (i.embedding <=> t.v)) from targets t) desc
  limit match_count;
$$;
