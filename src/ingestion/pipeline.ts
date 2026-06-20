/**
 * Weaver — ingestion pipeline orchestrator (§11 flow)
 *
 * The one path every item travels, manual-triggered (§7):
 *
 *   import → dedup → thumbnail-cache → embed → store
 *
 * This file is the SEAM. Each stage is an injected dependency (a port), so the
 * orchestrator stays pure and testable while real implementations (Supabase
 * storage, OpenCLIP, pgvector) land in later phases. Stages are stubbed with
 * clear TODOs; the wiring and data flow are real.
 */

import type { NormalizedItem } from "./types";
import type {
  ImportInput,
  ImportResult,
  ImporterRegistry,
} from "./importer";

/* ------------------------------------------------------------------ *
 * Stage ports — implemented per phase, injected here.
 * ------------------------------------------------------------------ */

/** Dedup: assign a stable cross-source key, drop collisions (§types DEDUP_NOTE). */
export interface DedupPort {
  /** Returns items with dedupKey set, duplicates removed. Needs thumbnail bytes
   *  for pHash, so it runs AFTER caching — see ordering note below. */
  dedupe(items: ThumbedItem[]): Promise<ThumbedItem[]>;
}

/** Thumbnail cache (§5.1): fetch each image, downscale to ~400px WebP, store. */
export interface ThumbnailCachePort {
  /**
   * Caches one image; returns the stored thumb reference, raw bytes (for pHash),
   * and the resized dimensions (so the feed reserves space → no layout shift).
   */
  cache(
    item: NormalizedItem
  ): Promise<{ thumbUrl: string; thumbBytes: Uint8Array; width: number; height: number }>;
}

/** Embedding (§8.2): OpenCLIP ViT-B/32 image → L2-normalized vector. */
export interface EmbedPort {
  /**
   * Batched on own compute / Colab. Returns one entry per input, same order.
   * Phase 1 has no embedder yet → entries may be null; the column is nullable
   * and embeddings backfill in Phase 2.
   */
  embed(items: ThumbedItem[]): Promise<(number[] | null)[]>;
}

/** Storage (§8): write rows to Supabase Postgres + pgvector. */
export interface StorePort {
  /** Upsert by dedupKey. Returns count actually written (new rows). */
  store(rows: StorableItem[]): Promise<number>;
}

/* ------------------------------------------------------------------ *
 * Intermediate shapes as an item moves through stages.
 * ------------------------------------------------------------------ */

export interface ThumbedItem extends NormalizedItem {
  thumbUrl: string;
  /** Held only in-memory for pHash dedup; not persisted. */
  thumbBytes: Uint8Array;
  width: number;
  height: number;
}

export interface StorableItem extends NormalizedItem {
  thumbUrl: string;
  width: number;
  height: number;
  embedding: number[] | null; // null until Phase 2 backfills (§8.2)
}

export interface PipelineDeps {
  importers: ImporterRegistry;
  thumbnails: ThumbnailCachePort;
  dedup: DedupPort;
  embed: EmbedPort;
  store: StorePort;
}

export interface PipelineReport {
  imported: ImportResult;
  cached: number;
  deduped: number; // items remaining after dedup
  embedded: number;
  stored: number; // new rows written
}

/* ------------------------------------------------------------------ *
 * Orchestrator.
 * ------------------------------------------------------------------ */

/**
 * Run one manual ingestion (§7). Resolves the importer for the platform, then
 * pushes its items through the fixed stage order.
 *
 * Ordering note: thumbnails are cached BEFORE dedup because dedup's pHash needs
 * the normalized thumbnail bytes — comparing raw source URLs/bytes is unreliable
 * across platforms that re-encode the same image.
 */
export async function runIngestion(
  platform: NormalizedItem["platform"],
  input: ImportInput,
  deps: PipelineDeps,
): Promise<PipelineReport> {
  const importer = deps.importers[platform];
  if (!importer) throw new Error(`No importer registered for platform: ${platform}`);
  if (!importer.routes.includes(input.route)) {
    throw new Error(`Importer for ${platform} does not support route: ${input.route}`);
  }

  // 1. Import → normalized items (images-only already enforced by the parser).
  const imported = await importer.import(input);

  // 2. Thumbnail-cache each item (§5.1). Failures drop the item, not the run.
  const thumbed: ThumbedItem[] = [];
  for (const item of imported.items) {
    try {
      const { thumbUrl, thumbBytes, width, height } = await deps.thumbnails.cache(item);
      thumbed.push({ ...item, thumbUrl, thumbBytes, width, height });
    } catch {
      // TODO: collect into report.warnings once thumbnails port reports detail.
    }
  }

  // 3. Dedup on thumbnail bytes (pHash) → cross-source identity.
  const deduped = await deps.dedup.dedupe(thumbed);

  // 4. Embed (batched).
  const vectors = await deps.embed.embed(deduped);

  // 5. Assemble storable rows (drop the transient thumbBytes) and store.
  const rows: StorableItem[] = deduped.map((it, i) => ({
    imageUrl: it.imageUrl,
    sourceLink: it.sourceLink,
    caption: it.caption,
    platform: it.platform,
    engagementSignal: it.engagementSignal,
    timestamp: it.timestamp,
    dedupKey: it.dedupKey,
    thumbUrl: it.thumbUrl,
    width: it.width,
    height: it.height,
    embedding: vectors[i],
  }));
  const stored = await deps.store.store(rows);

  return {
    imported,
    cached: thumbed.length,
    deduped: deduped.length,
    embedded: vectors.length,
    stored,
  };
}
