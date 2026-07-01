import "server-only";
import type { CandidateSource } from "./types";

/**
 * Discovery "doctor" — Agent-Reach's health-check idea, ported to Weaver.
 *
 * Pings each source's pull() and reports whether it returned candidates, WITHOUT
 * embedding or storing anything. Cheap dry-run: the only cost is the source's own
 * upstream fetch, so it fits the serverless budget with room to spare.
 *
 * Sources swallow their own blocks and degrade to an empty batch (so one wall
 * never fails a real sweep), which means "pulled 0" is the signal that a source
 * is walled or flaky today — not an exception. We classify:
 *   ok      → pulled > 0
 *   blocked → pulled == 0 (walled/flaky/empty upstream)
 *   error   → pull() threw (unexpected; source didn't guard something)
 */
export type SourceStatus = "ok" | "blocked" | "error";

export interface SourceHealth {
  source: string;
  status: SourceStatus;
  pulled: number;
  ms: number;
  sample?: string; // first candidate image URL, so you can eyeball what came back
  error?: string;
}

// Guard each source so one slow/hung upstream can't burn the whole budget. On
// timeout we mark it blocked (it produced nothing in time) rather than erroring.
const PER_SOURCE_TIMEOUT_MS = 15_000;

async function checkOne(source: CandidateSource): Promise<SourceHealth> {
  const started = Date.now();
  try {
    const items = await Promise.race([
      source.pull(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), PER_SOURCE_TIMEOUT_MS)
      ),
    ]);
    const ms = Date.now() - started;
    return {
      source: source.name,
      status: items.length ? "ok" : "blocked",
      pulled: items.length,
      ms,
      sample: items[0]?.imageUrl,
    };
  } catch (err) {
    const ms = Date.now() - started;
    const msg = err instanceof Error ? err.message : String(err);
    // A timeout means "nothing in time" → treat as blocked, not a code fault.
    return {
      source: source.name,
      status: msg === "timeout" ? "blocked" : "error",
      pulled: 0,
      ms,
      error: msg,
    };
  }
}

/** Run every source's health check in parallel; slowest source sets wall-clock. */
export async function runDoctor(sources: CandidateSource[]): Promise<SourceHealth[]> {
  return Promise.all(sources.map(checkOne));
}
