-- Weaver — allow new discovery + ingest source platforms.
--   cleveland   — Cleveland Museum of Art Open Access (keyless)
--   nasa        — NASA Image Library (keyless)
--   europeana   — Europeana (free key)
--   smithsonian — Smithsonian Open Access (free key)
--   rss         — generic RSS/Atom sources (Pinterest board RSS, Reddit RSS, blogs)
--   web         — add-by-URL / PWA share target / bookmarklet (OpenGraph scrape)
--   gallerydl   — local gallery-dl ingest (authenticated pulls of the user's own feeds)
alter table items drop constraint if exists items_platform_check;
alter table items add constraint items_platform_check
  check (platform in (
    'pinterest','twitter','threads','instagram',
    'reddit','arena','unsplash','openverse','artstation','artic',
    'metmuseum','wikimedia',
    'cleveland','nasa','europeana','smithsonian',
    'rss','web','gallerydl'
  ));
