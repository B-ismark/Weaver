import "./_env"; // load .env.local for local runs — must be first
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ingestSharedImage } from "@/lib/ingestUrl";

/**
 * Local gallery-dl ingest — the "piggyback your own session" unblocker.
 *
 * gallery-dl extracts image URLs from hundreds of sites (Pinterest, Instagram,
 * Twitter/X, Behance, ArtStation, Reddit, Tumblr…). Run LOCALLY it uses your
 * residential IP and your own browser cookies, so it reaches your authenticated
 * feeds — no platform API, no datacenter-IP wall.
 *
 * LIGHTWEIGHT BY DESIGN (addresses the storage worry): we run gallery-dl in
 * URL-extract mode (`-g`), so it prints image URLs and downloads NOTHING. We push
 * the URLs to Supabase and the HF Space embeds them by hotlink — zero local image
 * storage, a few MB of RAM, seconds per run.
 *
 * Setup (one-time): `pip install gallery-dl`. For authenticated pulls, either set
 * GALLERYDL_COOKIES_BROWSER=firefox|chrome|edge (reads the browser's cookie jar)
 * or GALLERYDL_COOKIES_FILE=/path/to/cookies.txt.
 *
 * Run:
 *   npm run ingest:gallerydl -- "https://www.pinterest.com/you/your-board/" …
 *   # or list one URL per line in gallerydl-targets.txt and run with no args.
 */

const CAP = Number(process.env.GALLERYDL_CAP) || 60; // max images pulled per target
const IMG_EXT = /\.(jpg|jpeg|png|webp|gif)(\?|$)/i;

function targets(): string[] {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  if (args.length) return args;
  const file = process.env.GALLERYDL_TARGETS || resolve(process.cwd(), "gallerydl-targets.txt");
  if (existsSync(file)) {
    return readFileSync(file, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
  }
  return [];
}

/** Extract media URLs for one target via `gallery-dl -g` (no download). */
function extractUrls(target: string): string[] {
  const args = ["-g", "--range", `1-${CAP}`];
  if (process.env.GALLERYDL_COOKIES_BROWSER) {
    args.push("--cookies-from-browser", process.env.GALLERYDL_COOKIES_BROWSER);
  } else if (process.env.GALLERYDL_COOKIES_FILE) {
    args.push("--cookies", process.env.GALLERYDL_COOKIES_FILE);
  }
  args.push(target);

  const run = spawnSync("gallery-dl", args, { encoding: "utf8", timeout: 120_000 });
  if (run.error) {
    if ((run.error as NodeJS.ErrnoException).code === "ENOENT") {
      console.error("gallery-dl not found on PATH. Install it: pip install gallery-dl");
      process.exit(127);
    }
    console.error(`gallery-dl failed for ${target}: ${run.error.message}`);
    return [];
  }
  if (run.stderr && run.status !== 0) console.error(run.stderr.trim());
  return (run.stdout || "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^https?:\/\//i.test(l) && IMG_EXT.test(l));
}

async function main() {
  const list = targets();
  if (!list.length) {
    console.error("No targets. Pass URLs as args or create gallerydl-targets.txt (one URL per line).");
    process.exit(2);
  }

  let added = 0;
  let dup = 0;
  let failed = 0;
  for (const target of list) {
    const urls = [...new Set(extractUrls(target))];
    console.log(`· ${target} → ${urls.length} image url(s)`);
    for (const imageUrl of urls) {
      try {
        const r = await ingestSharedImage({ imageUrl, caption: "", sourceLink: target }, "gallerydl");
        if (!r.ok) failed++;
        else if (r.duplicate) dup++;
        else added++;
      } catch {
        failed++;
      }
    }
  }

  console.log(`Done. added ${added}, duplicate ${dup}, failed ${failed}.`);
  if (added > 0) console.log("Tip: run POST /api/recluster (or the daily cron) to fully re-fit centroids.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
