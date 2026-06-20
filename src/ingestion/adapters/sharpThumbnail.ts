import "server-only";
import sharp from "sharp";
import { createHash } from "node:crypto";
import type { ThumbnailCachePort } from "../pipeline";
import type { NormalizedItem } from "../types";
import { getServerSupabase } from "@/lib/supabase/server";

/**
 * ThumbnailCachePort (§5.1): fetch the source image once, downscale to ~400px
 * WebP, upload to the public `thumbnails` bucket, return the public URL + the
 * resized bytes (the bytes feed the dedup pHash; not persisted elsewhere).
 *
 * Failures throw → the pipeline drops that single item, not the whole run.
 */
const BUCKET = "thumbnails";
const TARGET_WIDTH = 400;
const WEBP_QUALITY = 78;

export const sharpThumbnailCache: ThumbnailCachePort = {
  async cache(item: NormalizedItem) {
    // Some CDNs (e.g. Pinterest) reject the default Node UA — present a browser one.
    const res = await fetch(item.imageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
      },
    });
    if (!res.ok) throw new Error(`fetch ${res.status} for ${item.imageUrl}`);
    const input = Buffer.from(await res.arrayBuffer());

    const { data: thumbBytes, info } = await sharp(input)
      .resize({ width: TARGET_WIDTH, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true });

    // Content-addressed name → identical images reuse one object (cheap dedup
    // at the storage layer; semantic dedup still runs in aHashDedup).
    const name = createHash("sha1").update(thumbBytes).digest("hex");
    const path = `${item.platform}/${name}.webp`;

    const supabase = getServerSupabase();
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, thumbBytes, { contentType: "image/webp", upsert: true });
    if (error) throw new Error(`thumb upload failed: ${error.message}`);

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return {
      thumbUrl: data.publicUrl,
      thumbBytes: new Uint8Array(thumbBytes),
      width: info.width,
      height: info.height,
    };
  },
};
