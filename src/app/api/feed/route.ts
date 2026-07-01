import { getFeedItems } from "@/lib/items";

/**
 * GET /api/feed?limit=&exclude=id1,id2 — one page of the taste-ranked feed.
 *
 * Powers infinite scroll: the client passes the ids it has already shown this
 * session as `exclude`, and the server returns the next page (skipping them, so
 * pages don't repeat despite feed_by_taste's per-call randomisation). Returns an
 * empty array when the pool is exhausted → the client stops loading.
 */
export const dynamic = "force-dynamic";

const MAX_LIMIT = 60;
const MAX_EXCLUDE = 600; // cap the exclude list so the URL / query stays bounded

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(url.searchParams.get("limit")) || 30));
  const excludeParam = url.searchParams.get("exclude") ?? "";
  const exclude = excludeParam
    ? excludeParam.split(",").map((s) => s.trim()).filter(Boolean).slice(0, MAX_EXCLUDE)
    : [];

  const items = await getFeedItems(limit, exclude);
  return Response.json({ items });
}
