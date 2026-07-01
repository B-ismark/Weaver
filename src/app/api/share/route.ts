import { getServerSupabase } from "@/lib/supabase/server";
import { resolveImageFromUrl, ingestSharedImage, type ResolvedImage } from "@/lib/ingestUrl";

/**
 * POST /api/share — ingest shared content into the taste set.
 *
 * Two callers:
 *   1. PWA SHARE TARGET (multipart/form-data, a top-level navigation): the OS
 *      "Share" sheet posts { title, text, url, image(file) }. A shared image FILE
 *      is uploaded to the public bucket so the Space can fetch it; a shared LINK
 *      is scraped for its og:image. Responds with a 303 redirect to the library.
 *   2. ADD-BY-URL / BOOKMARKLET (application/json): { url } or a direct
 *      { imageUrl, caption?, sourceLink? }. Responds with JSON.
 *
 * Auth is the normal session gate (proxy.ts) — the share sheet + bookmarklet both
 * navigate/post from the owner's authenticated browser.
 */
export const maxDuration = 60; // embedding via the HF Space can be slow (cold start)

const IMG_EXT = /\.(jpg|jpeg|png|webp|gif)(\?|$)/i;
const URL_RE = /https?:\/\/[^\s"'<>]+/i;

function firstUrl(...candidates: (string | null | undefined)[]): string | null {
  for (const c of candidates) {
    if (!c) continue;
    const m = URL_RE.exec(c);
    if (m) return m[0];
  }
  return null;
}

/** Upload a shared image file to the public bucket and return its public URL. */
async function uploadFile(file: File): Promise<ResolvedImage | null> {
  const supabase = getServerSupabase();
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength === 0) return null;
  const type = file.type || "image/jpeg";
  const ext = (type.split("/")[1] || "jpg").replace(/[^a-z0-9]/gi, "") || "jpg";
  const path = `shares/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("thumbnails").upload(path, bytes, {
    contentType: type,
    upsert: false,
  });
  if (error) return null;
  const { data } = supabase.storage.from("thumbnails").getPublicUrl(path);
  if (!data?.publicUrl) return null;
  return { imageUrl: data.publicUrl, caption: file.name?.replace(IMG_EXT, "") ?? "", sourceLink: data.publicUrl };
}

function redirect(added: boolean): Response {
  // 303 so the browser issues a GET to the library after the POST navigation.
  const to = added ? "/library?shared=1" : "/add?error=1";
  return new Response(null, { status: 303, headers: { Location: to } });
}

export async function POST(request: Request): Promise<Response> {
  const contentType = request.headers.get("content-type") ?? "";

  // ---- 1. Share target (multipart form, navigation) ----------------------
  if (contentType.includes("multipart/form-data") || contentType.includes("form-urlencoded")) {
    const form = await request.formData().catch(() => null);
    if (!form) return redirect(false);

    let resolved: ResolvedImage | null = null;
    const file = form.get("image");
    if (file instanceof File && file.size > 0) {
      resolved = await uploadFile(file);
    }
    if (!resolved) {
      const url = firstUrl(form.get("url") as string, form.get("text") as string);
      if (url) resolved = await resolveImageFromUrl(url);
    }
    if (!resolved) return redirect(false);
    const result = await ingestSharedImage(resolved).catch(() => ({ ok: false }));
    return redirect(!!result.ok);
  }

  // ---- 2. Add-by-URL / bookmarklet (JSON) --------------------------------
  let body: { url?: string; imageUrl?: string; caption?: string; sourceLink?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  let resolved: ResolvedImage | null = null;
  if (body.imageUrl && IMG_EXT.test(body.imageUrl)) {
    resolved = {
      imageUrl: body.imageUrl,
      caption: (body.caption ?? "").slice(0, 300),
      sourceLink: body.sourceLink || body.imageUrl,
    };
  } else if (body.url) {
    resolved = await resolveImageFromUrl(body.url);
  }
  if (!resolved) return Response.json({ error: "no image found at that URL" }, { status: 422 });

  const result = await ingestSharedImage(resolved);
  if (!result.ok) return Response.json({ error: result.reason ?? "ingest failed" }, { status: 500 });
  return Response.json({ ok: true, id: result.id, duplicate: result.duplicate ?? false });
}
