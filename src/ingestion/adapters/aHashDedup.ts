import "server-only";
import sharp from "sharp";
import type { DedupPort, ThumbedItem } from "../pipeline";

/**
 * DedupPort (§types DEDUP_NOTE): assign a perceptual identity to each thumbnail
 * and collapse duplicates — the same image saved on Pinterest and Instagram
 * should become one feed item.
 *
 * Uses a 64-bit average hash (aHash): downscale to 8x8 grayscale, threshold each
 * pixel against the mean, pack into 16 hex chars. Cheap, robust to re-encoding
 * and minor resizing — the common cross-platform case. (pHash/DCT is stronger
 * but heavier; revisit if false-merges appear.)
 *
 * Within-batch dups are removed here; cross-run dups are caught by the unique
 * index on items.dedup_key.
 */
async function averageHash(bytes: Uint8Array): Promise<string> {
  const raw = await sharp(Buffer.from(bytes))
    .resize(8, 8, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer();

  let sum = 0;
  for (const v of raw) sum += v;
  const mean = sum / raw.length;

  let bits = 0n;
  for (let i = 0; i < 64; i++) {
    bits = (bits << 1n) | (raw[i] >= mean ? 1n : 0n);
  }
  return bits.toString(16).padStart(16, "0");
}

export const aHashDedup: DedupPort = {
  async dedupe(items: ThumbedItem[]): Promise<ThumbedItem[]> {
    const seen = new Set<string>();
    const out: ThumbedItem[] = [];
    for (const item of items) {
      const key = await averageHash(item.thumbBytes);
      if (seen.has(key)) continue; // keep first occurrence (earliest platform in run)
      seen.add(key);
      out.push({ ...item, dedupKey: key });
    }
    return out;
  },
};
