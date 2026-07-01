# Getting content into Weaver

Weaver has two content roles: **taste** (what you like — shapes the feed, hidden
from it) and **candidate** (new discovered images — what the feed shows). This
doc covers every way to feed both, including the unofficial "piggyback your own
session" paths that don't touch a platform API.

## Discovery (candidates → the feed)

Open, keyless image sources swept by the daily cron and the **Run discovery**
button: Are.na, Openverse, Wikimedia Commons, Art Institute of Chicago, The Met,
**Cleveland Museum**, **NASA**. Two more turn on with a free API key:

| Source      | Env var                | Key from |
| ----------- | ---------------------- | -------- |
| Europeana   | `EUROPEANA_KEY`        | https://pro.europeana.eu/get-api |
| Smithsonian | `SMITHSONIAN_API_KEY`  | https://api.data.gov/signup/ |

Seeds are **derived from your taste** (caption keywords + positive taste keywords)
so the wells follow your taste as it drifts — see `src/discovery/seeds.ts`.

### Discovery runs off Vercel now

The daily GitHub Action (`.github/workflows/discover.yml`) runs discovery **in the
runner**, not via the Vercel route, so it isn't bound by the 60s function cap and
`DISCOVERY_EMBED_CAP` can be large (default 500 in CI vs ~30 on Vercel). This is
the main fix for a feed that used to drain faster than it refilled.

Add these **repo secrets** (the app's server env) for the Action:
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `EMBED_ENDPOINT`, `EMBED_TOKEN`
(and optionally `EUROPEANA_KEY`, `SMITHSONIAN_API_KEY`, `RSS_FEEDS`,
`DISCOVERY_PROXY_URL`). Run locally too: `npm run discover -- arena cleveland nasa`.

## Taste (the signal that shapes the feed)

### PWA Share Target — mobile, zero friction

Install Weaver as a PWA. It then appears in the OS **Share** sheet. Share an image
or a link from any app (Instagram, Pinterest, a browser) → it lands in your taste
set. No API, no scraping — it rides your own session. Handled by `/api/share`.

### Add-by-URL + bookmarklet — desktop

Go to **/add**, paste any page or image link; Weaver scrapes its `og:image`,
embeds it, and adds it. Drag the **✦ Save to Weaver** bookmarklet to your toolbar
to do it in one click from any page.

### Local gallery-dl ingest — authenticated, unblockable, tiny

The strongest unblocker: run locally, so it uses **your residential IP and your
browser cookies** and reaches your own authenticated feeds — no platform API, no
datacenter-IP wall. It runs in **URL-extract mode** (`gallery-dl -g`), so it
downloads **nothing**: URLs go to Supabase and the HF Space embeds them by
hotlink. ~MB of RAM, seconds per run — safe to schedule.

```bash
pip install gallery-dl                       # one-time
# authenticated pulls of your own feeds — pick one:
export GALLERYDL_COOKIES_BROWSER=firefox     # reads the browser cookie jar
# export GALLERYDL_COOKIES_FILE=cookies.txt  # or an exported cookies.txt

npm run ingest:gallerydl -- "https://www.pinterest.com/you/your-board/"
# or list one URL per line in gallerydl-targets.txt and run with no args
```

Schedule it with Windows Task Scheduler / cron for a hands-off daily taste top-up.

### RSS — the walls platforms forgot to close

Set `RSS_FEEDS` (comma-separated) and the `rss` source pulls them. Works token-free
for feeds many APIs wall:

- Pinterest boards: `https://www.pinterest.com/<user>/<board>.rss`
- Reddit: `https://www.reddit.com/r/<sub>/.rss`
- Tumblr, Behance, blogs, most gallery software.

Datacenter-blocked feeds (Reddit/Pinterest from Vercel) route through the fetch
ladder (`DISCOVERY_PROXY_URL` / r.jina.ai) or just run them from the local daemon.

### Pinterest GDPR export

Still the most complete one-shot: parse your data export and reconstruct image
URLs. See the `pinterest-gdpr-import` note / prior import script.

## Database migrations to apply

Apply in the Supabase SQL editor (in order):

- `0017_feed_pagination_aesthetic.sql` — `aesthetic` column + `exclude_ids`
  (infinite scroll) + `min_aesthetic` quality floor on `feed_by_taste`.
- `0018_more_platforms.sql` — allows the new source/ingest platforms.

Optional feed tuning (env, no redeploy of SQL): `FEED_MIN_AESTHETIC`,
`FEED_SEEN_GRACE_HOURS`, `FEED_HIDE_SIMILARITY`.

**Aesthetic scale.** The LAION ViT-B/32 predictor is NOT the AVA 1–10 scale.
Measured on live data: min ~1.0, avg ~3.1, max ~5.3. So set `FEED_MIN_AESTHETIC`
to `0` (off) or ~`2.0` to trim the bottom — never ~4.5, which would empty the
feed. The rank nudge (migration 0019) is centered at 3 to match this.

Re-upload the HF Space (`hf-space/app.py`) so it serves the LAION aesthetic score;
until then `aesthetic` is null and the feed treats it as neutral (nothing breaks).
