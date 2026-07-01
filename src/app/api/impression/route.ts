import { getServerSupabase } from "@/lib/supabase/server";

/**
 * POST /api/impression — record that feed tiles were shown to the user.
 * Body: { ids: string[] }. Stamps `seen_at` on each candidate the FIRST time it
 * is seen (only when currently null), so feed_by_taste can drop it after the
 * grace window (see migration 0016). Best-effort + idempotent.
 */
export async function POST(request: Request): Promise<Response> {
  let body: { ids?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const ids = Array.isArray(body.ids)
    ? body.ids.filter((x): x is string => typeof x === "string").slice(0, 200)
    : [];
  if (ids.length === 0) return Response.json({ ok: true, marked: 0 });

  const supabase = getServerSupabase();
  const { error, count } = await supabase
    .from("items")
    .update({ seen_at: new Date().toISOString() }, { count: "exact" })
    .in("id", ids)
    .is("seen_at", null);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, marked: count ?? 0 });
}
