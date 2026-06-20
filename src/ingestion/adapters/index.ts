import "server-only";
import type { PipelineDeps } from "../pipeline";
import type { ImporterRegistry } from "../importer";
import { pinterestImporter } from "../parsers/pinterest";
import { sharpThumbnailCache } from "./sharpThumbnail";
import { aHashDedup } from "./aHashDedup";
import { noopEmbed } from "./noopEmbed";
import { supabaseStore } from "./supabaseStore";

/**
 * Concrete pipeline wiring for Phase 1. Swapping an implementation (e.g. real
 * embeddings in Phase 2) is a one-line change here — nothing else moves.
 */
const importers: ImporterRegistry = {
  pinterest: pinterestImporter,
  // twitter / threads / instagram importers land in Phase 3.
};

export function buildPipelineDeps(): PipelineDeps {
  return {
    importers,
    thumbnails: sharpThumbnailCache,
    dedup: aHashDedup,
    embed: noopEmbed, // Phase 2 → real OpenCLIP embedder
    store: supabaseStore,
  };
}
