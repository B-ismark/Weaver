// Probes Pinterest's unofficial web-search endpoint (the one pinterest.com itself
// calls from its search bar) to see whether it answers from THIS machine.
//
// Usage:
//   node scripts/probe-pinterest-search.mjs                      # default terms
//   node scripts/probe-pinterest-search.mjs "brutalist architecture" "concept art"
//   PROBE_PAGES=3 node scripts/probe-pinterest-search.mjs "ceramics"   # follow pagination
//
// Run it on your own laptop first (home connection), then again from the place
// Weaver actually runs (Vercel cron / HF Space / VPS). Different result = that's
// the datacenter block. Read-only, a handful of requests, spaced out. No keys.
//
// NB: undocumented endpoint, almost certainly against Pinterest's terms. This is
// a feasibility probe, not something the feed should depend on.

const ENDPOINT = "https://www.pinterest.com/resource/BaseSearchResource/get/";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
const GAP_MS = 2500; // be polite between requests
const PAGES = Math.max(1, Number(process.env.PROBE_PAGES ?? 1));
const terms = process.argv.slice(2);
if (!terms.length) terms.push("brutalist architecture", "concept art");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function buildUrl(query, bookmark) {
  const options = { query, scope: "pins", page_size: 25, no_fetch_context_on_resource: false };
  if (bookmark) options.bookmarks = [bookmark];
  const params = new URLSearchParams({
    source_url: `/search/pins/?q=${encodeURIComponent(query)}&rs=typed`,
    data: JSON.stringify({ options, context: {} }),
    _: String(Date.now()),
  });
  return `${ENDPOINT}?${params}`;
}

// Classify what came back so a block reads as a block, not as a parse error.
function verdict(status, contentType, text) {
  if (status === 429) return "RATE-LIMITED (429) — slow down / blocked";
  if (status === 403) return "BLOCKED (403) — likely IP/datacenter or bot wall";
  if (status === 401) return "UNAUTHORISED (401) — wants login cookies";
  if (status >= 500) return `PINTEREST ERROR (${status})`;
  if (status >= 300) return `REDIRECT (${status}) — probably bounced to login/consent`;
  if (!/json/i.test(contentType ?? "")) {
    return /captcha|robot|unusual traffic/i.test(text)
      ? "CAPTCHA / bot-check page"
      : "NON-JSON reply (HTML wall or consent page)";
  }
  return null; // looks like JSON — keep going
}

async function probe(query) {
  console.log(`\n=== "${query}" ===`);
  let bookmark;
  for (let page = 1; page <= PAGES; page++) {
    const t0 = performance.now();
    let res, text;
    try {
      res = await fetch(buildUrl(query, bookmark), {
        redirect: "manual",
        headers: {
          "User-Agent": UA,
          Accept: "application/json, text/javascript, */*, q=0.01",
          "Accept-Language": "en-US,en;q=0.9",
          "X-Requested-With": "XMLHttpRequest",
          "X-Pinterest-AppState": "active",
          "X-Pinterest-PWS-Handler": "www/search/[scope].js",
          Referer: `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}`,
        },
      });
      text = await res.text();
    } catch (err) {
      console.log(`page ${page}: NETWORK ERROR — ${err.cause?.code ?? err.message}`);
      return false;
    }
    const ms = Math.round(performance.now() - t0);
    const bad = verdict(res.status, res.headers.get("content-type"), text);
    console.log(`page ${page}: HTTP ${res.status} · ${ms}ms · ${text.length.toLocaleString()} bytes`);
    if (bad) {
      console.log(`  ✗ ${bad}`);
      console.log(`  first 160 chars: ${text.slice(0, 160).replace(/\s+/g, " ")}`);
      return false;
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      console.log("  ✗ claimed JSON but did not parse");
      return false;
    }
    const rr = json.resource_response ?? {};
    const results = rr.data?.results ?? [];
    console.log(`  ✓ ${results.length} results (status field: ${rr.status ?? "n/a"})`);
    if (rr.error) console.log(`  ! error field: ${JSON.stringify(rr.error).slice(0, 200)}`);

    // Only pins have images; the list can also hold ads/ideas/"related" modules.
    const pins = results.filter((r) => r?.images);
    if (page === 1) {
      console.log(`  pins with images: ${pins.length}/${results.length}`);
      for (const p of pins.slice(0, 5)) {
        const title = (p.grid_title || p.title || p.description || "").trim().slice(0, 60);
        const sizes = Object.keys(p.images).join(",");
        console.log(`   · ${p.id}  "${title}"  [${sizes}]`);
        console.log(`     ${p.images.orig?.url ?? p.images["736x"]?.url ?? "(no image url)"}`);
      }
      const keys = pins[0] ? Object.keys(pins[0]).slice(0, 25).join(", ") : "—";
      console.log(`  fields on a pin: ${keys}`);
    }

    bookmark = rr.bookmark;
    if (!bookmark || bookmark === "-end-") {
      if (page < PAGES) console.log("  (no further pages)");
      break;
    }
    if (page < PAGES) await sleep(GAP_MS);
  }
  return true;
}

let ok = 0;
for (let i = 0; i < terms.length; i++) {
  if (await probe(terms[i])) ok++;
  if (i < terms.length - 1) await sleep(GAP_MS);
}

console.log(`\n${ok}/${terms.length} searches answered with usable JSON.`);
console.log(
  ok === terms.length
    ? "→ Endpoint is reachable from here. Worth wiring as an optional discovery source."
    : ok
      ? "→ Flaky from here. Re-run a few times / try another network before deciding."
      : "→ Not usable from here (see verdict lines above). Try your home connection, then your host.",
);
process.exit(ok ? 0 : 1);
