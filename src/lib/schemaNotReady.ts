import "server-only";

/**
 * Thrown when a query hits a column/RPC that a migration adds but that
 * hasn't actually been applied to this Supabase project yet. Merging the
 * migration FILE doesn't run it — someone still has to apply it (Supabase
 * dashboard SQL editor, or `supabase db push` with the CLI linked) — so a
 * fresh deploy of code that assumes a migration is applied can hit this
 * before that manual step happens. Callers should treat it as "not yet
 * configured" (log once, don't fail the whole scheduled run), not a bug.
 */
export class SchemaNotReadyError extends Error {}

const UNDEFINED_COLUMN = "42703";
const UNDEFINED_FUNCTION = "42883";

export function isSchemaNotReady(error: { code?: string } | null | undefined): boolean {
  return error?.code === UNDEFINED_COLUMN || error?.code === UNDEFINED_FUNCTION;
}
