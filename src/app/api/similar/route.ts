import { getSimilarItems } from "@/lib/items";

/**
 * GET /api/similar?id=<itemId> — "more like this" (§6.1), nearest neighbours by
 * image embedding (pgvector `items_like`).
 *
 * Client-fetched by the detail OVERLAY (DetailOverlay/Lightbox): the overlay opens
 * instantly from the tapped tile's data, then streams the related grid in behind a
 * skeleton via this route — so the slow pgvector query never gates the morph.
 * Returns an empty array on a missing id or no neighbours.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ items: [] });
  const items = await getSimilarItems(id);
  return Response.json({ items });
}
