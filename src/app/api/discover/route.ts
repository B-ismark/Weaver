import { runDiscovery } from "@/discovery/refresh";
import { runDoctor } from "@/discovery/doctor";
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
// Auth is enforced in proxy.ts (session cookie, or CRON_SECRET bearer for the
// scheduled job) — no in-route guard needed.
//
// Embedding via the HF Space is slow; ask for the max serverless budget (Vercel
// Hobby ceiling is 60s — EMBED_CAP is sized to fit).
export const maxDuration = 60;

/**
 * POST /api/discover — trigger a discovery refresh (v2 D1). Pulls fresh
 * candidates from one or more sources, embeds (HF Space), stores them for the
 * taste-ranked feed. Manual or scheduled (GitHub Actions cron — D4); guarded by
 * CRON_SECRET when set.
 *
 * Body (optional):
 *   { source: "arena" }              — single source (default arena)
 *   { sources: ["arena","openverse"] } — sweep several in one tick
 * (Reddit kept for reference but currently 403s unauthenticated.)
 */
const SOURCES = {
  arena: arenaSource,
  openverse: openverseSource,
  reddit: redditSource,
  artstation: artstationSource,
  artic: articSource,
  metmuseum: metmuseumSource,
  wikimedia: wikimediaSource,
  cleveland: clevelandSource,
  nasa: nasaSource,
  europeana: europeanaSource, // needs EUROPEANA_KEY (else yields nothing)
  smithsonian: smithsonianSource, // needs SMITHSONIAN_API_KEY (else yields nothing)
  rss: rssSource, // needs RSS_FEEDS (Pinterest board / Reddit / blog feeds; else nothing)
  "pinterest-discover": pinterestDiscoverSource, // DuckDuckGo → similar Pinterest feeds (no key)
};

/**
 * GET /api/discover — the "doctor" (Agent-Reach health-check port). Pings every
 * source (or ?sources=a,b) and reports which are ok / blocked / erroring today,
 * WITHOUT embedding or storing. Use it to see which walls are up before a sweep.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const param = url.searchParams.get("sources");
  const names = param ? param.split(",").map((s) => s.trim()).filter(Boolean) : Object.keys(SOURCES);

  const unknown = names.filter((n) => !(n in SOURCES));
  if (unknown.length) {
    return Response.json(
      { error: `Unknown source(s): ${unknown.join(", ")}. Options: ${Object.keys(SOURCES).join(", ")}` },
      { status: 422 }
    );
  }

  const health = await runDoctor(names.map((n) => SOURCES[n as keyof typeof SOURCES]));
  const summary = {
    ok: health.filter((h) => h.status === "ok").map((h) => h.source),
    blocked: health.filter((h) => h.status === "blocked").map((h) => h.source),
    error: health.filter((h) => h.status === "error").map((h) => h.source),
  };
  return Response.json({ ok: true, summary, health });
}

export async function POST(request: Request): Promise<Response> {
  let names: string[] = ["arena"];
  try {
    const body = (await request.json()) as { source?: string; sources?: string[] };
    if (Array.isArray(body?.sources) && body.sources.length) names = body.sources;
    else if (body?.source) names = [body.source];
  } catch {
    // no body → default
  }

  const unknown = names.filter((n) => !(n in SOURCES));
  if (unknown.length) {
    return Response.json(
      { error: `Unknown source(s): ${unknown.join(", ")}. Options: ${Object.keys(SOURCES).join(", ")}` },
      { status: 422 }
    );
  }

  try {
    const reports = [];
    for (const n of names) {
      reports.push(await runDiscovery(SOURCES[n as keyof typeof SOURCES]));
    }

    // Content-based de-dup pass (migration 0009): collapses the same image that
    // arrived under different URLs. Non-fatal — if the RPC isn't applied yet,
    // discovery still succeeds.
    let deduped: number | null = null;
    try {
      const { data, error } = await getServerSupabase().rpc("dedup_candidates");
      if (!error && typeof data === "number") deduped = data;
    } catch {
      // RPC missing or failed → skip silently
    }

    // single-source call keeps the old flat shape; multi-source returns an array.
    return reports.length === 1
      ? Response.json({ ok: true, ...reports[0], deduped })
      : Response.json({ ok: true, reports, deduped });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Discovery failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
