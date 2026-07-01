-- Weaver — lock down publishable-key access (security hardening).
--
-- The publishable key ships in the browser, so with RLS disabled anyone holding
-- it could read/write these tables directly via PostgREST — the passcode gate
-- does not cover direct API access. The app never queries these tables from the
-- browser (getBrowserSupabase is unused); all reads/writes go through server
-- routes using the secret key, which BYPASSES RLS. So enable RLS with NO
-- policies: the server keeps full access, the publishable key is fully locked
-- out. Same posture already used by oauth_tokens (0008).

alter table public.items            enable row level security;
alter table public.taste_centroids  enable row level security;
alter table public.engagement_events enable row level security;
alter table public.taste_keywords   enable row level security;
