-- Weaver — Phase 2 vector search RPCs (§6, §8).
-- pgvector cosine distance operator is `<=>`; with L2-normalized embeddings,
-- cosine_similarity = 1 - (a <=> b). Embeddings are 512-dim (OpenCLIP ViT-B/32).
--
-- These are SECURITY DEFINER so the publishable key cannot call them with
-- arbitrary access beyond what they return; reads still go through the server.

-- ---------------------------------------------------------------------------
-- feed_by_taste: rank items by similarity to the user's NEAREST taste centroid
-- (§8.3 — serves every distinct interest, not a blurred average). Returns empty
-- when no centroids exist yet → caller falls back to recency.
-- ---------------------------------------------------------------------------
create or replace function feed_by_taste(match_count int default 60)
returns setof items
language sql stable
as $$
  select i.*
  from items i
  cross join taste_centroids c
  where i.embedding is not null
  group by i.id
  order by max(1 - (i.embedding <=> c.centroid)) desc
  limit match_count;
$$;

-- ---------------------------------------------------------------------------
-- items_like: nearest neighbours to a given item ("more like this", §6.1).
-- Excludes the target itself.
-- ---------------------------------------------------------------------------
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
  order by i.embedding <=> t.embedding
  limit match_count;
$$;

-- ---------------------------------------------------------------------------
-- search_items: semantic text→image search (§8.4). The query embedding is the
-- CLIP text-tower output, passed as text and cast to vector (PostgREST-friendly).
-- ---------------------------------------------------------------------------
create or replace function search_items(query text, match_count int default 40)
returns setof items
language sql stable
as $$
  select i.*
  from items i
  where i.embedding is not null
  order by i.embedding <=> (query::vector(512))
  limit match_count;
$$;
