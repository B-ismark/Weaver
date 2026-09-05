import "server-only";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { getServerSupabase } from "@/lib/supabase/server";
import { getProxyDispatcher } from "@/lib/proxyDispatcher";

/**
 * Shared fetch → resize → upload primitive behind BOTH the import pipeline's
 * thumbnail cache (src/ingestion/adapters/sharpThumbnail.ts) and the discovery
 * candidate cache (src/discovery/cacheCandidates.ts). One fetch of the source
 * image produces every requested variant (e.g. a small grid thumb + a larger
 * detail-view size), so a multi-tier caller never pays for the download twice.
 */

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

export interface ImageVariantSpec {
  /** Path/cache-key suffix, e.g. "thumb" or "large". Must be filename-safe. */
  suffix: string;
  width: number;
  quality: number;
}

export interface CachedVariant {
  url: string;
  width: number;
  height: number;
  /** The resized WebP bytes actually uploaded (e.g. for a caller's own pHash). */
  bytes: Uint8Array;
}

/**
 * The single shared bucket + thumbnail spec both caching paths (the import
 * pipeline's sharpThumbnail.ts and discovery's cacheCandidates.ts) write to —
 * kept in one place so the two callers can never drift into producing
 * differently-sized "thumb" variants under the same suffix.
 */
export const THUMBNAIL_BUCKET = "thumbnails";
export const THUMBNAIL_VARIANT: ImageVariantSpec = { suffix: "thumb", width: 400, quality: 78 };

/**
 * Fetch source bytes with a browser UA (some CDNs, e.g. Pinterest, reject the
 * default Node UA), falling back to the discovery egress proxy for sources
 * that wall datacenter IPs outright (same DISCOVERY_PROXY_URL used by
 * src/discovery/fetch.ts's escalation ladder).
 */
async function fetchImageBytes(url: string): Promise<Buffer> {
  const headers = { "User-Agent": BROWSER_UA, Accept: "image/avif,image/webp,image/*,*/*;q=0.8" };

  const direct = await fetch(url, { headers }).catch(() => null);
  if (direct?.ok) return Buffer.from(await direct.arrayBuffer());

  const dispatcher = await getProxyDispatcher();
  if (!dispatcher) {
    throw new Error(`fetch ${direct?.status ?? "failed"} for ${url}`);
  }
  const viaProxy = await fetch(url, {
    headers,
    // @ts-expect-error dispatcher is a Node/undici extension not in the DOM types
    dispatcher,
  }).catch(() => null);
  if (!viaProxy?.ok) throw new Error(`fetch ${viaProxy?.status ?? "failed"} for ${url} (direct + proxy)`);
  return Buffer.from(await viaProxy.arrayBuffer());
}

/**
 * Fetch `sourceUrl` once, produce every variant in `variants`, upload each as
 * content-addressed WebP to `${bucket}/${pathPrefix}/${hash}-${suffix}.webp`,
 * return each variant's public URL + resized dims keyed by suffix.
 */
export async function cacheImageVariants(
  sourceUrl: string,
  variants: readonly ImageVariantSpec[],
  opts: { bucket: string; pathPrefix: string }
): Promise<Record<string, CachedVariant>> {
  const input = await fetchImageBytes(sourceUrl);
  const supabase = getServerSupabase();
  const out: Record<string, CachedVariant> = {};

  for (const variant of variants) {
    const { data: bytes, info } = await sharp(input)
      .resize({ width: variant.width, withoutEnlargement: true })
      .webp({ quality: variant.quality })
      .toBuffer({ resolveWithObject: true });

    // Content-addressed name → identical images (or re-runs) reuse one object.
    const hash = createHash("sha1").update(bytes).digest("hex");
    const path = `${opts.pathPrefix}/${hash}-${variant.suffix}.webp`;

    const { error } = await supabase.storage
      .from(opts.bucket)
      .upload(path, bytes, { contentType: "image/webp", upsert: true });
    if (error) throw new Error(`${variant.suffix} upload failed: ${error.message}`);

    const { data } = supabase.storage.from(opts.bucket).getPublicUrl(path);
    out[variant.suffix] = { url: data.publicUrl, width: info.width, height: info.height, bytes };
  }

  return out;
}
