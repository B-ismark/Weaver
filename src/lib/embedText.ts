import "server-only";

/**
 * Embed a search query via the live CLIP text-tower endpoint (§9, HF Spaces).
 * Returns a pgvector literal '[...]' ready for search_items, or null when the
 * endpoint isn't configured or fails (caller degrades gracefully).
 *
 * Env:
 *   EMBED_ENDPOINT  e.g. https://<user>-<space>.hf.space
 *   EMBED_TOKEN     optional shared secret (matches the Space's EMBED_TOKEN)
 */
export async function embedQuery(text: string): Promise<string | null> {
  const endpoint = process.env.EMBED_ENDPOINT;
  if (!endpoint || !text.trim()) return null;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.EMBED_TOKEN) headers.Authorization = `Bearer ${process.env.EMBED_TOKEN}`;

  try {
    const res = await fetch(`${endpoint.replace(/\/$/, "")}/embed`, {
      method: "POST",
      headers,
      body: JSON.stringify({ text }),
      // The free Space cold-starts (~10-20s); give it room (§9).
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { embedding?: number[] };
    if (!Array.isArray(data.embedding) || data.embedding.length === 0) return null;
    return `[${data.embedding.join(",")}]`;
  } catch {
    return null;
  }
}
