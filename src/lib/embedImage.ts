import "server-only";

/**
 * Embed images via the HF Space (§9, discovery §10.4). Batch — returns one
 * vector per URL in order, null for any that failed. Used for:
 *   - backfilling taste-item embeddings (no local torch needed), and
 *   - embedding discovery candidates during refresh.
 *
 * Env: EMBED_ENDPOINT (+ optional EMBED_TOKEN), shared with embedText.ts.
 */
const MAX_BATCH = 64; // matches the Space's MAX_IMAGES

/** Embedding + intrinsic dims for one image (null when it failed to embed). */
export interface EmbedResult {
  embedding: number[];
  width: number;
  height: number;
  // LAION aesthetic score (~1..10) from the Space, when its head is loaded.
  // null when scoring is unavailable → callers store null (feed treats it neutral).
  aesthetic: number | null;
}

export async function embedImages(urls: string[]): Promise<(EmbedResult | null)[]> {
  const endpoint = process.env.EMBED_ENDPOINT;
  if (!endpoint || urls.length === 0) return urls.map(() => null);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.EMBED_TOKEN) headers.Authorization = `Bearer ${process.env.EMBED_TOKEN}`;

  const results: (EmbedResult | null)[] = [];
  for (let i = 0; i < urls.length; i += MAX_BATCH) {
    const batch = urls.slice(i, i + MAX_BATCH);
    try {
      const res = await fetch(`${endpoint.replace(/\/$/, "")}/embed-image`, {
        method: "POST",
        headers,
        body: JSON.stringify({ urls: batch }),
        // CPU embedding of a full batch + possible cold start (§10).
        signal: AbortSignal.timeout(180_000),
      });
      if (!res.ok) {
        results.push(...batch.map(() => null));
        continue;
      }
      const data = (await res.json()) as {
        embeddings?: (number[] | null)[];
        dims?: ([number, number] | null)[];
        aesthetics?: (number | null)[];
      };
      const vecs = data.embeddings ?? [];
      const dims = data.dims ?? [];
      const aes = data.aesthetics ?? [];
      for (let j = 0; j < batch.length; j++) {
        const v = vecs[j];
        const d = dims[j];
        const a = aes[j];
        results.push(
          v
            ? {
                embedding: v,
                width: d?.[0] ?? 0,
                height: d?.[1] ?? 0,
                aesthetic: typeof a === "number" ? a : null,
              }
            : null
        );
      }
    } catch {
      results.push(...batch.map(() => null));
    }
  }
  return results;
}

/** Format a vector as a pgvector literal '[a,b,c]'. */
export function toPgVector(vec: number[]): string {
  return `[${vec.join(",")}]`;
}
