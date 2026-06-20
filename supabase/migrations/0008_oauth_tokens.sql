-- Weaver — OAuth token store (D4, auto-refresh / Pinterest live-fetch).
-- Single-user: one row per provider. Holds the long-lived refresh token + the
-- short-lived access token so the server can pull saved pins on a schedule
-- without the user re-authorizing each time.
--
-- SECURITY: tokens are bearer credentials. RLS is enabled with NO policies, so
-- only the secret/service key (which bypasses RLS) can read or write this table;
-- the publishable key is fully locked out — same posture as the rest of the app.

create table if not exists oauth_tokens (
  provider      text primary key,            -- 'pinterest'
  access_token  text not null,
  refresh_token text,                        -- absent for providers that don't issue one
  scope         text,
  expires_at    timestamptz,                 -- access_token expiry; null = unknown/non-expiring
  updated_at    timestamptz not null default now()
);

alter table oauth_tokens enable row level security;
-- intentionally no policies → publishable key cannot touch it.
