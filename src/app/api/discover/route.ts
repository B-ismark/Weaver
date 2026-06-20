import { runDiscovery } from "@/discovery/refresh";
import { arenaSource } from "@/discovery/sources/arena";
import { openverseSource } from "@/discovery/sources/openverse";
import { redditSource } from "@/discovery/sources/reddit";
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
};

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
    // single-source call keeps the old flat shape; multi-source returns an array.
    return reports.length === 1
      ? Response.json({ ok: true, ...reports[0] })
      : Response.json({ ok: true, reports });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Discovery failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
