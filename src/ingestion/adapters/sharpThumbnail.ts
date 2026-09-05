import "server-only";
import type { ThumbnailCachePort } from "../pipeline";
import type { NormalizedItem } from "../types";
import { cacheImageVariants, THUMBNAIL_BUCKET, THUMBNAIL_VARIANT } from "@/lib/imageCache";

/**
 * ThumbnailCachePort (§5.1): fetch the source image once, downscale to ~400px
 * WebP, upload to the public `thumbnails` bucket, return the public URL + the
 * resized bytes (the bytes feed the dedup pHash; not persisted elsewhere).
 *
 * Failures throw → the pipeline drops that single item, not the whole run.
 *
 * The actual fetch/resize/upload lives in src/lib/imageCache.ts, shared with
 * the discovery candidate cache (src/discovery/cacheCandidates.ts) — this
 * adapter just supplies the shared "thumb" variant and keeps the pHash-friendly
 * raw bytes.
 */
export const sharpThumbnailCache: ThumbnailCachePort = {
  async cache(item: NormalizedItem) {
    const variants = await cacheImageVariants(item.imageUrl, [THUMBNAIL_VARIANT], {
      bucket: THUMBNAIL_BUCKET,
      pathPrefix: item.platform,
    });
    const thumb = variants[THUMBNAIL_VARIANT.suffix];
    return { thumbUrl: thumb.url, thumbBytes: thumb.bytes, width: thumb.width, height: thumb.height };
  },
};
