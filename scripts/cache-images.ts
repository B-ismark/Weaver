/**
 * Off-Vercel candidate image cache runner (image-cache plan, Phase 1).
 *
 * Same reasoning as scripts/discover.ts: this fetches+resizes+uploads one
 * image per candidate row, which doesn't fit Vercel Hobby's 60s route cap at
 * any real batch size, so it runs on the same GitHub Actions runner right
 * after discovery (see .github/workflows/discover.yml).
 *
 * Run:
 *   CACHE_FILL_BATCH=200 npm run cache-images
 */
import "./_env"; // load .env.local for local runs (no-op in CI) — must be first
import { cacheCandidateThumbnails } from "@/discovery/cacheCandidates";
import { evictStaleCandidates } from "@/discovery/evictCandidates";

async function main() {
  const fillBatch = Number(process.env.CACHE_FILL_BATCH) || 100;

  const fill = await cacheCandidateThumbnails(fillBatch);
  console.log(`✓ cache-fill: scanned ${fill.scanned}, cached ${fill.cached}, failed ${fill.failed}`);

  const evicted = await evictStaleCandidates();
  console.log(`✓ eviction: deleted ${evicted.deletedRows} row(s), ${evicted.deletedObjects} storage object(s)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
