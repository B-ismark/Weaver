import { getServerSupabase } from "@/lib/supabase/server";
import { embedQuery } from "@/lib/embedText";

/**
 * Taste keywords (discovery spec §5.2; Pinterest "interests"). A keyword is a
 * CLIP text embedding in the same space as images, so it steers the image feed:
 *   - positive → pulls the feed toward the concept
 *   - negative → pushes matching images out ("don't show me X")
 *
 * GET    → list keywords
 * POST   { text, polarity } → embed via the Space, store
 * DELETE ?id=… → remove
 */
export async function GET(): Promise<Response> {
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from("taste_keywords")
    .select("id, text, polarity, created_at")
    .order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ keywords: data });
}

export async function POST(request: Request): Promise<Response> {
  let body: { text?: string; polarity?: "positive" | "negative" };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const text = body.text?.trim();
  const polarity = body.polarity === "negative" ? "negative" : "positive";
  if (!text) return Response.json({ error: "text required" }, { status: 422 });

  const embedding = await embedQuery(text); // pgvector literal, via HF Space
  if (!embedding) {
    return Response.json({ error: "could not embed keyword (embedding endpoint?)" }, { status: 502 });
  }

  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from("taste_keywords")
    .upsert({ text, polarity, embedding }, { onConflict: "text,polarity" })
    .select("id, text, polarity")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, keyword: data });
}

export async function DELETE(request: Request): Promise<Response> {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 422 });
  const supabase = getServerSupabase();
  const { error } = await supabase.from("taste_keywords").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
