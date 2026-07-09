-- Weaver — restore the "more like this" filters that 0015 dropped (regression).
--
-- 0005 had scoped items_like to role='candidate' AND `not hidden`, so "Threads
-- from this" only ever surfaced NEW, un-rejected discoveries — the whole point of
-- a discovery engine's "more like this". 0015 redefined items_like to add the
-- `score` projection but reverted the body to the pre-0005 version, silently
-- dropping BOTH filters. Effect since 0015: the detail view's "Threads from this"
-- mixes in your own saved/taste images AND images you explicitly hit "Not my
-- taste" on — so a rejected image keeps reappearing, and a hide never syncs there.
--
-- This re-adds the two filters on top of 0015's score-returning signature. Return
-- type is unchanged, so items.ts keeps working. DROP first (0015 changed the
-- return type from `setof items` to `table(...)`, so CREATE OR REPLACE won't do).

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
    -- restored (regressed by 0015): only new discoveries, never your own saves…
    and i.role = 'candidate'
    -- …and never something you already rejected as "not my taste".
    and not i.hidden
  order by i.embedding <=> t.embedding
  limit match_count;
$$;
