-- Weaver — content-based candidate de-duplication (fixes images appearing twice).
--
-- Discovery dedups by exact image_url, but the same picture arrives under
-- different URLs (Twitter/Arena CDN query params like ?format=jpg&name=large,
-- the same Are.na block re-hosted across channels, etc.), so duplicates slip in
-- and show up multiple times in the feed.
--
-- Embeddings already exist, and near-identical images sit at cosine ~0.99, so we
-- dedup on content: delete any candidate that's a near-duplicate of an EARLIER
-- item (an earlier-stored candidate, or any taste item), keeping the first copy.
-- Threshold 0.96 = "same image / trivial re-encode", high enough not to collapse
-- merely-similar but distinct images.

create or replace function dedup_candidates(threshold float default 0.96)
returns int
language plpgsql
as $$
declare
  removed int;
begin
  with dups as (
    select c.id
    from items c
    where c.role = 'candidate'
      and c.embedding is not null
      and exists (
        select 1
        from items d
        where d.id <> c.id
          and d.embedding is not null
          -- "earlier" = a taste item, or an earlier-created/lower-id candidate
          and (
            d.role = 'taste'
            or d.created_at < c.created_at
            or (d.created_at = c.created_at and d.id < c.id)
          )
          and (1 - (c.embedding <=> d.embedding)) > threshold
      )
  )
  delete from items where id in (select id from dups);
  get diagnostics removed = row_count;
  return removed;
end;
$$;
