/**
 * Weaver — importer contract (§4.4, §6.4)
 *
 * Every source (export file or live API) implements SourceImporter. The
 * ingestion pipeline calls them uniformly and never branches on platform.
 *
 * Two import routes, one output:
 *   - "export"  → user uploads a downloaded archive (§4.1)
 *   - "api"     → live OAuth-backed pull (§4.2), e.g. Pinterest
 * Both yield NormalizedItem[]. The connection screen can mix routes per
 * platform transparently (§6.4).
 */

import type { NormalizedItem, Platform } from "./types";

/** How the data physically arrives. */
export type ImportRoute = "export" | "api";

/** Raw input handed to an importer. Shape depends on the route. */
export type ImportInput =
  | { route: "export"; /** Bytes/text of the uploaded export archive. */ file: ArrayBuffer | string }
  | { route: "api"; /** Scoped OAuth access token for the platform. */ accessToken: string };

/** Non-fatal problems with individual records — surfaced, not thrown. */
export interface ImportWarning {
  /** Index or id of the offending record, for the user-facing report. */
  record: string;
  reason: string;
}

/** Result of one import run. */
export interface ImportResult {
  platform: Platform;
  route: ImportRoute;
  /** Items that parsed cleanly AND carried a usable image (§3). */
  items: NormalizedItem[];
  /** Records skipped (no image, malformed) — for transparency, never silent. */
  skipped: number;
  warnings: ImportWarning[];
}

/**
 * The contract. One implementation per (platform, supported route).
 * Pure: parse input → normalized items. No network beyond the API route's own
 * fetches; no thumbnail caching, no embedding, no DB — those are later pipeline
 * stages that consume ImportResult.items.
 */
export interface SourceImporter {
  readonly platform: Platform;
  /** Routes this importer supports. Pinterest: both. Twitter: ["export"] only (§6.2). */
  readonly routes: readonly ImportRoute[];

  /** Parse/fetch and normalize. Throws only on unusable input (e.g. wrong file). */
  import(input: ImportInput): Promise<ImportResult>;
}

/**
 * Registry the pipeline consults. Keyed by platform. Manual-refresh model (§7):
 * the user picks a platform + route in the UI, this resolves the importer, runs
 * it, and the resulting items flow to thumbnail-cache → embed → store.
 */
export type ImporterRegistry = Partial<Record<Platform, SourceImporter>>;
