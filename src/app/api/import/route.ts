import { runIngestion } from "@/ingestion/pipeline";
import { buildPipelineDeps } from "@/ingestion/adapters";
import type { Platform } from "@/ingestion/types";

/**
 * POST /api/import — manual export import (§7). Multipart form:
 *   - platform: "pinterest" (others in Phase 3)
 *   - file: the export's saved-pins JSON or CSV (caller unzips first)
 *
 * Runs the full ingestion pipeline (import → thumb-cache → dedup → store) and
 * returns the report. Long-running for big exports; that's fine for a manual,
 * single-user action.
 */
const SUPPORTED: Platform[] = ["pinterest"];

export async function POST(request: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Expected multipart form-data" }, { status: 400 });
  }

  const platform = String(form.get("platform") ?? "") as Platform;
  const file = form.get("file");

  if (!SUPPORTED.includes(platform)) {
    return Response.json(
      { error: `Unsupported platform "${platform}". Supported: ${SUPPORTED.join(", ")}` },
      { status: 422 }
    );
  }
  if (!(file instanceof File)) {
    return Response.json({ error: "Missing export file" }, { status: 422 });
  }

  try {
    const text = await file.text();
    const report = await runIngestion(platform, { route: "export", file: text }, buildPipelineDeps());
    return Response.json({
      ok: true,
      platform,
      parsed: report.imported.items.length,
      skipped: report.imported.skipped,
      cached: report.cached,
      deduped: report.deduped,
      stored: report.stored,
      warnings: report.imported.warnings.slice(0, 20),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
