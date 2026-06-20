-- Weaver — storage for cached thumbnails (Phase 1, §5.1)
-- Creates a PUBLIC bucket so the feed can render thumbs via plain URLs (the
-- thumbnails are derived/low-res; the originals stay behind source-out links).

insert into storage.buckets (id, name, public)
values ('thumbnails', 'thumbnails', true)
on conflict (id) do nothing;

-- Public read of thumbnails (bucket is public, but make the policy explicit).
-- CREATE POLICY has no IF NOT EXISTS, so drop-then-create for idempotency.
drop policy if exists "thumbnails public read" on storage.objects;
create policy "thumbnails public read"
  on storage.objects for select
  using (bucket_id = 'thumbnails');

-- Writes happen only via the server secret key (bypasses RLS), so no
-- client-side insert policy is granted on purpose.
