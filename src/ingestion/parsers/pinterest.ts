/**
 * Weaver — Pinterest importer (§4.4 priority 1)
 *
 * RESEARCH NOTES (June 2026):
 *   - Official export: Settings → Privacy & data → "Request your data". Pinterest
 *     emails a download link via SendSafely, up to ~48h later (§6.5: not instant).
 *   - Archive is a ZIP containing JSON + CSV files plus images.
 *   - Saved-pin records carry: image/source URLs, title/description, board +
 *     section names, save date, hashtags.
 *   - Pinterest does NOT publish the export schema, and field names vary by
 *     export version. So this parser does NOT hard-code one key layout — it
 *     extracts tolerantly from a list of candidate keys (PIN_FIELD_CANDIDATES)
 *     and accepts either JSON or CSV. When a real export is in hand, narrow the
 *     candidates to what's actually present (§14 Q1/Q3).
 *   - Image URLs are Pinterest CDN (i.pinimg.com) — comparatively stable, but
 *     still thumbnail-cached at ingest per §5.1; never assumed permanent.
 *
 * Scope: this file handles the EXPORT route end-to-end. The API route is stubbed
 * until the Pinterest OAuth app passes review (Phase 1, §6.5).
 */

import type { NormalizedItem } from "../types";
import { SIGNAL_BY_PLATFORM } from "../types";
import type {
  ImportInput,
  ImportResult,
  ImportWarning,
  SourceImporter,
} from "../importer";

/**
 * Candidate keys per logical field, tried in order (case-insensitive). Covers
 * the variants seen across JSON exports, CSV headers, and the public API shape.
 * Narrow these once a real export is verified.
 */
const PIN_FIELD_CANDIDATES = {
  imageUrl: ["image_url", "image", "media_url", "imageUrl", "Image URL", "cover_image_url"],
  sourceLink: ["link", "pin_url", "url", "source_url", "Pin URL", "Link"],
  caption: ["title", "Title", "note", "description", "Description", "grid_title"],
  timestamp: ["created_at", "created", "save_date", "Created at", "date", "saved_at"],
} as const;

type RawRecord = Record<string, unknown>;

/** Case-insensitive lookup over candidate keys; returns first non-empty string. */
function pick(record: RawRecord, candidates: readonly string[]): string | undefined {
  const lowerMap = new Map<string, unknown>();
  for (const [k, v] of Object.entries(record)) lowerMap.set(k.toLowerCase(), v);
  for (const cand of candidates) {
    const v = lowerMap.get(cand.toLowerCase());
    if (typeof v === "string" && v.trim() !== "") return v.trim();
    if (typeof v === "number") return String(v);
  }
  return undefined;
}

function mapRecord(
  record: RawRecord,
  index: number,
  warnings: ImportWarning[],
): NormalizedItem | null {
  const imageUrl = pick(record, PIN_FIELD_CANDIDATES.imageUrl);

  // Images-only (§3): no usable image → drop, record why.
  if (!imageUrl) {
    warnings.push({ record: `pin[${index}]`, reason: "no image field found" });
    return null;
  }

  const sourceLink = pick(record, PIN_FIELD_CANDIDATES.sourceLink) ?? imageUrl;
  const caption = pick(record, PIN_FIELD_CANDIDATES.caption) ?? "";
  const rawTs = pick(record, PIN_FIELD_CANDIDATES.timestamp);

  return {
    imageUrl,
    sourceLink,
    caption,
    platform: "pinterest",
    engagementSignal: SIGNAL_BY_PLATFORM.pinterest, // "saved"
    timestamp: normalizeTimestamp(rawTs),
    // dedupKey left undefined — filled post-thumbnail (see DEDUP_NOTE in types.ts)
  };
}

/** Coerce a source date to ISO 8601; fall back to import time if unparseable. */
function normalizeTimestamp(raw: string | undefined): string {
  if (raw) {
    const t = Date.parse(raw);
    if (!Number.isNaN(t)) return new Date(t).toISOString();
  }
  return new Date().toISOString();
}

/** Minimal RFC-4180-ish CSV → records. Handles quoted fields, commas, newlines. */
function parseCsv(text: string): RawRecord[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } // escaped quote
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); if (row.some((f) => f !== "")) rows.push(row); }

  if (rows.length === 0) return [];
  const header = rows[0];
  return rows.slice(1).map((cells) => {
    const rec: RawRecord = {};
    header.forEach((h, i) => (rec[h] = cells[i] ?? ""));
    return rec;
  });
}

/** Minimal HTML entity decode for the few entities Pinterest emits in text. */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .trim();
}

/** A "No data" / empty field → treated as absent. */
function realOrEmpty(s: string | undefined): string {
  const v = (s ?? "").trim();
  return !v || v.toLowerCase() === "no data" ? "" : v;
}

/**
 * Reconstruct the Pinterest CDN URL from the export's image HASH.
 * The export only gives a hash; the path is /<size>/<h0h1>/<h2h3>/<h4h5>/<hash>.jpg.
 * We use the 736x variant, not /originals/, because Pinterest reliably generates
 * 736x for every (re)pin regardless of the original's extension (verified: some
 * originals are .png and 403 as .jpg, but 736x.jpg always resolves). 736px also
 * exceeds our 400px thumbnail target, so quality is unaffected.
 */
function imageUrlFromHash(hash: string): string {
  return `https://i.pinimg.com/736x/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash.slice(4, 6)}/${hash}.jpg`;
}

/**
 * Parse the REAL Pinterest data export, which is HTML (pins/0001.html) — a flat
 * list of pin blocks, each a "Key: value <br>" group. Produces RawRecord[] in
 * the same {image_url, link, title, created_at} shape the JSON/CSV path uses,
 * so the rest of the importer is unchanged.
 */
function parsePinterestHtml(text: string): RawRecord[] {
  const records: RawRecord[] = [];
  // Each pin starts with an anchor to its pinterest.com/pin/<id>/ page.
  const anchor = /<a href="(https:\/\/www\.pinterest\.com\/pin\/\d+\/?)"/g;
  const starts: { url: string; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = anchor.exec(text))) starts.push({ url: m[1], index: m.index });

  const field = (block: string, label: string): string => {
    const re = new RegExp(`${label}:\\s*([\\s\\S]*?)\\s*<br>`, "i");
    return realOrEmpty(decodeEntities(re.exec(block)?.[1] ?? ""));
  };

  for (let i = 0; i < starts.length; i++) {
    const block = text.slice(starts[i].index, starts[i + 1]?.index ?? text.length);

    // Image hash (hex). Skip pins without a usable image (videos, story pins). §3
    const hash = /Image:\s*([0-9a-f]{16,})\s*<br>/i.exec(block)?.[1];
    if (!hash) continue;

    const title = field(block, "Title");
    const details = field(block, "Details");
    const created = field(block, "Created at");

    records.push({
      image_url: imageUrlFromHash(hash),
      link: starts[i].url,
      title: title || details, // Title is usually "No data" → fall back to Details
      created_at: created.replace(/\//g, "-"), // 2026/05/10 → 2026-05-10 (parseable)
    });
  }
  return records;
}

/** Extract records from JSON, CSV, or the real HTML export. */
function extractRecords(text: string): RawRecord[] {
  const trimmed = text.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const parsed: unknown = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed as RawRecord[];
    // Tolerate wrapper objects: { pins: [...] }, { data: [...] }, { saved_pins: [...] }
    const obj = parsed as Record<string, unknown>;
    for (const key of ["pins", "data", "saved_pins", "items", "boards"]) {
      if (Array.isArray(obj[key])) return obj[key] as RawRecord[];
    }
    return [];
  }
  // Real Pinterest export is HTML ("Subject Access Request Data - Pins").
  if (/<html|<!doctype|Subject Access Request/i.test(trimmed.slice(0, 200))) {
    return parsePinterestHtml(text);
  }
  return parseCsv(text);
}

export const pinterestImporter: SourceImporter = {
  platform: "pinterest",
  routes: ["export", "api"],

  async import(input: ImportInput): Promise<ImportResult> {
    if (input.route === "export") {
      // NOTE: caller is responsible for unzipping the SendSafely archive and
      // passing ONE file's contents (the saved-pins JSON or CSV) as input.file.
      const text =
        typeof input.file === "string"
          ? input.file
          : new TextDecoder().decode(input.file);

      let records: RawRecord[];
      try {
        records = extractRecords(text);
      } catch {
        throw new Error("Pinterest export is neither valid JSON nor parseable CSV");
      }

      const warnings: ImportWarning[] = [];
      const items = records
        .map((r, i) => mapRecord(r, i, warnings))
        .filter((x): x is NormalizedItem => x !== null);

      return {
        platform: "pinterest",
        route: "export",
        items,
        skipped: records.length - items.length,
        warnings,
      };
    }

    // route === "api": live OAuth pull of saved pins/boards (§4.2, §6.4).
    // TODO Phase 1: GET /v5/pins with the scoped token, page through, map each
    // record via mapRecord(). Stubbed until OAuth app passes review (§6.5).
    throw new Error("Pinterest API route not implemented yet (Phase 1)");
  },
};
