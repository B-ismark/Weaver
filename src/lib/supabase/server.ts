import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client (PRIVILEGED — uses the secret key, bypasses RLS).
 * Use only in route handlers, server actions, server components, and ingestion.
 * Never import this into a "use client" module.
 *
 * Single-user v1: no per-request auth/cookies — one trusted backend identity.
 */
let cached: SupabaseClient | null = null;

export function getServerSupabase(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    throw new Error(
      "Missing Supabase env: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local"
    );
  }

  cached = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
