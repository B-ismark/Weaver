import "server-only";
import { getServerSupabase } from "@/lib/supabase/server";
import { embedImages, toPgVector } from "@/lib/embedImage";
import { pullTowardCentroid } from "@/lib/tasteSteer";
import { fetchTextResilient } from "@/discovery/fetch";

/**
 * Ingest an image (or a page containing one) into the TASTE set — the backend for
 * the PWA share target, the add-by-URL form, and the bookmarklet.
 *
 * Shared content is an explicit "I like this", so it lands as role='taste' (a
 * taste signal, like the Pinterest import), not a discovery candidate. We resolve
 * a usable image URL (direct image, or scrape og:image / twitter:image from the
 * page), embed it via the HF Space (hotlinked — no local storage), store it, then
 * nudge the nearest centroid toward it so the feed reacts immediately.
 */

const IMG_EXT = /\.(jpg|jpeg|png|webp|gif)(\?|$)/i;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

export interface ResolvedImage {
  imageUrl: string;
  caption: string;
  sourceLink: string;
}

/** Pull a meta-tag content value, tolerant of attribute order. */
function metaContent(html: string, key: string): string | null {
  const a = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key}["'][^>]*\\bcontent=["']([^"']+)["']`,
    "i"
  ).exec(html);
  if (a) return a[1];
  const b = new RegExp(
    `<meta[^>]+\\bcontent=["']([^"']+)["'][^>]*(?:property|name)=["']${key}["']`,
    "i"
  ).exec(html);
  return b ? b[1] : null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/**
 * Turn any page or image URL into a usable image + caption. Returns null when no
 * image can be found (e.g. a login-walled page that hides og:image).
 */
export async function resolveImageFromUrl(pageUrl: string): Promise<ResolvedImage | null> {
  let u: URL;
  try {
    u = new URL(pageUrl);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;

  // Direct image URL → use as-is.
  if (IMG_EXT.test(u.pathname)) {
    return { imageUrl: u.toString(), caption: "", sourceLink: u.toString() };
  }

  // Otherwise fetch the page and scrape OpenGraph / Twitter card image.
  const html = await fetchTextResilient(u.toString(), {
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
  });
  if (!html) return null;

  const rawImg =
    metaContent(html, "og:image:secure_url") ||
    metaContent(html, "og:image:url") ||
    metaContent(html, "og:image") ||
    metaContent(html, "twitter:image") ||
    metaContent(html, "twitter:image:src");
  if (!rawImg) return null;

  let imageUrl: string;
  try {
    imageUrl = new URL(decodeEntities(rawImg), u).toString(); // resolve relative → absolute
  } catch {
    return null;
  }

  const titleMeta =
    metaContent(html, "og:title") ||
    metaContent(html, "twitter:title") ||
    /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ||
    "";

  return {
    imageUrl,
    caption: decodeEntities(titleMeta.replace(/\s+/g, " ").trim()).slice(0, 300),
    sourceLink: u.toString(),
  };
}

export interface IngestResult {
  ok: boolean;
  id?: string;
  duplicate?: boolean;
  reason?: string;
}

/**
 * Embed + store a resolved image as a taste item. `platform` defaults to 'web'
 * (share target / add-by-URL); the local gallery-dl daemon passes 'gallerydl'.
 */
export async function ingestSharedImage(
  resolved: ResolvedImage,
  platform: "web" | "gallerydl" = "web"
): Promise<IngestResult> {
  const supabase = getServerSupabase();

  // Dedup on the exact image URL (cheap; content-dedup happens in the sweep pass).
  const { data: existing } = await supabase
    .from("items")
    .select("id")
    .eq("image_url", resolved.imageUrl)
    .maybeSingle();
  if (existing?.id) return { ok: true, id: String(existing.id), duplicate: true };

  const [embed] = await embedImages([resolved.imageUrl]);
  if (!embed) return { ok: false, reason: "could not fetch or embed the image" };

  const { data, error } = await supabase
    .from("items")
    .insert({
      platform,
      engagement: "saved",
      role: "taste",
      image_url: resolved.imageUrl,
      thumb_url: resolved.imageUrl, // hotlink; not cached
      thumb_width: embed.width || null,
      thumb_height: embed.height || null,
      source_link: resolved.sourceLink,
      caption: resolved.caption,
      embedding: toPgVector(embed.embedding),
      aesthetic: embed.aesthetic,
    })
    .select("id")
    .single();
  if (error) return { ok: false, reason: error.message };

  // Immediate feed effect; full drift correction on the next re-cluster.
  await pullTowardCentroid(supabase, embed.embedding).catch(() => {});

  return { ok: true, id: data?.id ? String(data.id) : undefined };
}
