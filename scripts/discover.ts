/**
 * Off-Vercel discovery runner.
 *
 * WHY: on Vercel Hobby the discovery route has a hard 60s cap, so the embed batch
 * is throttled to ~30 images/source/day — the feed's #1 bottleneck (it drains
 * faster than the cron refills it). A GitHub Actions runner has NO such cap, so we
 * run the SAME source code here with a much larger DISCOVERY_EMBED_CAP and let the
 * HF Space embed as many as it can. Nothing about the sources changes; only the
 * host and the cap do.
 *
 * Run (needs the app's server env — see .github/workflows/discover.yml):
 *   DISCOVERY_EMBED_CAP=500 npm run discover -- arena openverse cleveland nasa …
 *
 * `--conditions=react-server` makes `import "server-only"` resolve to an empty
 * module (instead of throwing), so the real server modules load under plain Node.
 */
import "./_env"; // load .env.local for local runs (no-op in CI) — must be first
import { runDiscovery } from "@/discovery/refresh";
import type { CandidateSource } from "@/discovery/types";
import { arenaSource } from "@/discovery/sources/arena";
import { openverseSource } from "@/discovery/sources/openverse";
import { redditSource } from "@/discovery/sources/reddit";
import { artstationSource } from "@/discovery/sources/artstation";
import { articSource } from "@/discovery/sources/artic";
import { metmuseumSource } from "@/discovery/sources/metmuseum";
import { wikimediaSource } from "@/discovery/sources/wikimedia";
import { clevelandSource } from "@/discovery/sources/cleveland";
import { nasaSource } from "@/discovery/sources/nasa";
import { europeanaSource } from "@/discovery/sources/europeana";
import { smithsonianSource } from "@/discovery/sources/smithsonian";
import { rssSource } from "@/discovery/sources/rss";
import { pinterestDiscoverSource } from "@/discovery/sources/pinterestDiscover";
import { getServerSupabase } from "@/lib/supabase/server";

const SOURCES: Record<string, CandidateSource> = {
  arena: arenaSource,
  openverse: openverseSource,
  reddit: redditSource,
  artstation: artstationSource,
  artic: articSource,
  metmuseum: metmuseumSource,
  wikimedia: wikimediaSource,
  cleveland: clevelandSource,
  nasa: nasaSource,
  europeana: europeanaSource,
  smithsonian: smithsonianSource,
  rss: rssSource,
  "pinterest-discover": pinterestDiscoverSource,
};

// Default sweep = the keyless / open sources (key-gated ones no-op without a key,
// so including them is harmless; reddit/artstation are best-effort behind walls).
const DEFAULT = [
  "arena",
  "openverse",
  "artic",
  "metmuseum",
  "wikimedia",
  "cleveland",
  "nasa",
  "europeana",
  "smithsonian",
  "rss",
];

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const names = args.length ? args : DEFAULT;

  const unknown = names.filter((n) => !(n in SOURCES));
  if (unknown.length) {
    console.error(`Unknown source(s): ${unknown.join(", ")}. Options: ${Object.keys(SOURCES).join(", ")}`);
    process.exit(2);
  }

  let total = 0;
  for (const n of names) {
    try {
      const r = await runDiscovery(SOURCES[n]);
      total += r.stored;
      console.log(`✓ ${n}: pulled ${r.pulled}, fresh ${r.fresh}, embedded ${r.embedded}, stored ${r.stored}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`✗ ${n}: ${msg}`); // non-fatal — keep sweeping the rest
    }
  }

  // Content-dedup pass (collapses the same image arriving under different URLs).
  try {
    const { data } = await getServerSupabase().rpc("dedup_candidates");
    if (typeof data === "number") console.log(`· deduped ${data} near-duplicate candidate(s)`);
  } catch {
    // RPC missing → skip silently
  }

  console.log(`Done. ${total} new candidate(s) stored across ${names.length} source(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
