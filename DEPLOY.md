# Deploying Weaver ($0: Vercel + GitHub Actions cron)

Vercel free tier serves the app; GitHub Actions runs the daily auto-refresh
([.github/workflows/discover.yml](.github/workflows/discover.yml)) by hitting the
deployed cron endpoints. The repo must live on GitHub (the cron needs it).

## 0. Before you start

- Supabase migrations must be applied in the SQL editor, in order, through the
  latest (`0001` … `0015`). Apply any you haven't yet run. Notable recent ones:
  - `0012_enable_rls_lockdown.sql` — RLS hardening on core tables.
  - `0013_artic_platform.sql`, `0014_museum_platforms.sql` — allow the new
    keyless discovery sources (Art Institute of Chicago, The Met, Wikimedia).
  - `0015_feed_score.sql` — redefines `feed_by_taste` / `items_like` to also
    return the raw cosine **taste-match score**. Return-type change, so it drops
    + recreates both functions — apply it as-is.
  - `0016_seen_and_negative.sql` — adds `seen_at` (impression exclusion: content
    you've already scrolled past drops out of the feed after a 6h grace window)
    and a negative **hide** signal (candidates similar to anything you hid are
    suppressed). Redefines `feed_by_taste` again (drop + recreate). Requires the
    `/api/impression` endpoint, which ships with the app.
  - `0008_oauth_tokens.sql` is only needed for the Pinterest **OAuth** flow —
    skip if using a manual `PINTEREST_ACCESS_TOKEN`.
- `.env.local` is gitignored (`.env*`) — secrets will **not** be committed.
  Verify with `git status` before the first push.

## 1. Push to GitHub

```bash
git init
git add .
git commit -m "Weaver: deploy prep (D4 cron + Pinterest scaffold)"
gh repo create weaver --private --source=. --push   # or create on github.com and push
```

## 2. Import to Vercel

- vercel.com → New Project → import the `weaver` repo. Framework auto-detects
  Next.js. Build command `next build`, no overrides needed.
- Deploy. Note the production URL, e.g. `https://weaver-xyz.vercel.app`.

## 3. Vercel environment variables

Project → Settings → Environment Variables (Production). Copy from `.env.local`:

| Var | Notes |
|-----|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | public |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | public |
| `SUPABASE_SECRET_KEY` | **secret** — server only |
| `EMBED_ENDPOINT` | HF Space URL |
| `EMBED_TOKEN` | HF Space auth |
| `WEAVER_PASSCODE` | **new** — the access passcode; unset = app is public |
| `CRON_SECRET` | **new** — generate one (below); guards the cron endpoints |
| `DISCOVERY_EMBED_CAP` | optional, default 48 (sized for the 60s function limit) |
| `FEED_SEEN_GRACE_HOURS` | optional, default 6 — hours a scrolled-past tile stays in the feed before it drops out |
| `FEED_HIDE_SIMILARITY` | optional, default 0.85 — cosine above which a candidate is suppressed as "like" something you hid (lower = more aggressive) |
| `PINTEREST_ACCESS_TOKEN` | optional — once Pinterest activates the app |

Generate a `CRON_SECRET`:

```bash
openssl rand -hex 32
```

Redeploy after adding vars (Vercel does this automatically on save, or trigger
a redeploy).

## 4. GitHub repo secrets (for the cron)

Repo → Settings → Secrets and variables → Actions → New repository secret:

- `APP_URL` = your Vercel URL, **no trailing slash** (e.g. `https://weaver-xyz.vercel.app`)
- `CRON_SECRET` = the **same** value you set in Vercel

The workflow runs daily 07:00 UTC; trigger a manual run from the Actions tab to
test (`workflow_dispatch`).

## 5. Pinterest OAuth (later, when the app is activated)

- Set `PINTEREST_REDIRECT_URI=https://<your-vercel-url>/api/pinterest/callback`
  in Vercel **and** register that exact URI in the Pinterest app.
- Set `PINTEREST_CLIENT_ID` (App ID 1583013) + `PINTEREST_CLIENT_SECRET`.
- Apply `0008_oauth_tokens.sql`. Visit `/api/pinterest/auth` once to connect.

## Notes / gotchas

- **Function timeout:** Vercel Hobby caps serverless functions at 60s. Discovery
  + Pinterest sync embed images via the HF Space (slow, cold starts), so per-run
  work is capped small (`DISCOVERY_EMBED_CAP` / `PINTEREST_SYNC_CAP`, default 48)
  and the daily cron accumulates. If runs still time out, lower the caps, or move
  the heavy work into a Node script run *by* the GitHub Action (no Vercel limit).
- **next/image hosts** are already whitelisted in `next.config.ts` for the CDNs
  in use (Supabase, i.pinimg.com, images.are.na, *.cloudfront.net, redd.it).
- The Are.na discovery source is token-free and works in production as-is.
