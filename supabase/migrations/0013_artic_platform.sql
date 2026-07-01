-- Weaver — allow Art Institute of Chicago as a discovery source platform.
alter table items drop constraint if exists items_platform_check;
alter table items add constraint items_platform_check
  check (platform in (
    'pinterest','twitter','threads','instagram',
    'reddit','arena','unsplash','openverse','artstation','artic'
  ));
