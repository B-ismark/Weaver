import type { EngagementEvent, EngagementType } from "@/lib/engagement";
import { getServerSupabase } from "@/lib/supabase/server";

/**
 * POST /api/events — ingest one engagement event (§12). Validates, persists to
 * the Supabase `engagement_events` table, and returns 204 quickly so
 * sendBeacon/keepalive calls stay cheap. Persistence failures are swallowed
 * (logging must never break the feed), but still return 204.
 */
const VALID_TYPES: EngagementType[] = ["impression", "click", "save", "dwell", "dismiss"];

export async function POST(request: Request): Promise<Response> {
  let event: EngagementEvent;
  try {
    event = (await request.json()) as EngagementEvent;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (!event?.itemId || !VALID_TYPES.includes(event.type)) {
    return new Response("Invalid event", { status: 422 });
  }

  try {
    await getServerSupabase()
      .from("engagement_events")
      .insert({ item_id: event.itemId, type: event.type, value: event.value ?? null });
  } catch {
    // best-effort: never surface logging errors to the client
  }

  return new Response(null, { status: 204 });
}
