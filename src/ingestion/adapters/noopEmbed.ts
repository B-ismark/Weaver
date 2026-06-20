import type { EmbedPort, ThumbedItem } from "../pipeline";

/**
 * EmbedPort placeholder for Phase 1. Real OpenCLIP ViT-B/32 embedding lands in
 * Phase 2 (run offline / Colab, then backfilled). Until then items store a null
 * embedding and the feed ranks by recency rather than taste.
 */
export const noopEmbed: EmbedPort = {
  async embed(items: ThumbedItem[]): Promise<(number[] | null)[]> {
    return items.map(() => null);
  },
};
