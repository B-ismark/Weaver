import "server-only";
import type { NormalizedItem } from "@/ingestion/types";
import { getServerSupabase } from "@/lib/supabase/server";

/**
 * Pinterest API v5 OAuth + saved-pins fetch (D4 — auto-refresh taste signal).
 *
 * SCAFFOLD: wired against the documented v5 endpoints but UNTESTED until a real
 * Pinterest app supplies creds. Env required:
 *   PINTEREST_CLIENT_ID, PINTEREST_CLIENT_SECRET, PINTEREST_REDIRECT_URI
 * The redirect URI must match the app's registered URI exactly, e.g.
 *   https://<your-app>/api/pinterest/callback
 *
 * Flow: /api/pinterest/auth → Pinterest consent → /api/pinterest/callback
 * exchanges the code for tokens (stored in oauth_tokens). /api/pinterest/sync
 * then pulls saved pins as role='taste' items, refreshing the access token as
 * needed. Pins are the user's "saved" signal (SIGNAL_BY_PLATFORM.pinterest).
 *
 * Refs (Pinterest API v5):
 *   authorize  https://www.pinterest.com/oauth/
 *   token      POST https://api.pinterest.com/v5/oauth/token  (Basic client_id:secret)
 *   list pins  GET  https://api.pinterest.com/v5/pins         (Bearer, bookmark paging)
 *   scopes     boards:read, pins:read
 */
const AUTHORIZE_URL = "https://www.pinterest.com/oauth/";
const TOKEN_URL = "https://api.pinterest.com/v5/oauth/token";
const PINS_URL = "https://api.pinterest.com/v5/pins";
const SCOPES = "boards:read,pins:read";
const PROVIDER = "pinterest";

interface PinterestConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** Throws a clear error if the app isn't configured — surfaced to the caller. */
export function getConfig(): PinterestConfig {
  const clientId = process.env.PINTEREST_CLIENT_ID;
  const clientSecret = process.env.PINTEREST_CLIENT_SECRET;
  const redirectUri = process.env.PINTEREST_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Pinterest not configured: set PINTEREST_CLIENT_ID, PINTEREST_CLIENT_SECRET, PINTEREST_REDIRECT_URI"
    );
  }
  return { clientId, clientSecret, redirectUri };
}

/** Full OAuth flow is possible (client creds + redirect all set). */
export function canStartOAuth(): boolean {
  return !!(
    process.env.PINTEREST_CLIENT_ID &&
    process.env.PINTEREST_CLIENT_SECRET &&
    process.env.PINTEREST_REDIRECT_URI
  );
}

/**
 * A manually-generated access token pasted into env. Pinterest's "Generate
 * token" (Production Limited) hands one out immediately — before the app secret
 * unlocks from trial review — so this is the fast path to test saved-pins sync.
 * No refresh token; expires on its own and must be regenerated.
 */
function hasManualToken(): boolean {
  return !!process.env.PINTEREST_ACCESS_TOKEN;
}

/** Anything usable is set: either the OAuth flow or a manual token. */
export function isConfigured(): boolean {
  return canStartOAuth() || hasManualToken();
}

/** The consent URL to redirect the user to. `state` guards against CSRF. */
export function buildAuthUrl(state: string): string {
  const { clientId, redirectUri } = getConfig();
  const u = new URL(AUTHORIZE_URL);
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", SCOPES);
  u.searchParams.set("state", state);
  return u.toString();
}

function basicAuthHeader(): string {
  const { clientId, clientSecret } = getConfig();
  return "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
}

// --- token storage (oauth_tokens, migration 0008) --------------------------

interface StoredToken {
  access_token: string;
  refresh_token: string | null;
  scope: string | null;
  expires_at: string | null;
}

async function saveToken(t: {
  access_token: string;
  refresh_token?: string | null;
  scope?: string | null;
  expires_in?: number | null;
}): Promise<void> {
  const supabase = getServerSupabase();
  const expiresAt =
    typeof t.expires_in === "number"
      ? new Date(Date.now() + t.expires_in * 1000).toISOString()
      : null;
  // Upsert one row per provider. Keep the existing refresh_token if a refresh
  // response omits it (Pinterest may rotate or reuse it).
  const row: Record<string, unknown> = {
    provider: PROVIDER,
    access_token: t.access_token,
    scope: t.scope ?? null,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  };
  if (t.refresh_token) row.refresh_token = t.refresh_token;
  const { error } = await supabase.from("oauth_tokens").upsert(row, { onConflict: "provider" });
  if (error) throw new Error(`token save failed: ${error.message}`);
}

async function loadToken(): Promise<StoredToken | null> {
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from("oauth_tokens")
    .select("access_token, refresh_token, scope, expires_at")
    .eq("provider", PROVIDER)
    .maybeSingle();
  if (error) throw new Error(`token load failed: ${error.message}`);
  return (data as StoredToken) ?? null;
}

export async function isConnected(): Promise<boolean> {
  if (hasManualToken()) return true; // env token is usable without OAuth/DB
  if (!canStartOAuth()) return false;
  // Resilient: if the oauth_tokens table doesn't exist yet (migration 0008 not
  // applied) or the read fails, treat as not-connected rather than crashing the
  // page that renders the connect button.
  try {
    return (await loadToken()) !== null;
  } catch {
    return false;
  }
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  scope?: string;
  expires_in?: number;
  token_type?: string;
}

/** Exchange the OAuth `code` for tokens and persist them. Called on callback. */
export async function exchangeCode(code: string): Promise<void> {
  const { redirectUri } = getConfig();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`token exchange failed (${res.status}): ${await res.text()}`);
  }
  const t = (await res.json()) as TokenResponse;
  await saveToken(t);
}

/** Refresh using the stored refresh_token; persists and returns the new access token. */
async function refreshAccessToken(refreshToken: string): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`token refresh failed (${res.status}): ${await res.text()}`);
  }
  const t = (await res.json()) as TokenResponse;
  // Pinterest may not return a new refresh_token; keep the old one if so.
  await saveToken({ ...t, refresh_token: t.refresh_token ?? refreshToken });
  return t.access_token;
}

/** A usable access token, refreshing if expired. Throws if not connected. */
async function getValidAccessToken(): Promise<string> {
  // Manual token (env) wins — the trial-access fast path, no DB/OAuth needed.
  const manual = process.env.PINTEREST_ACCESS_TOKEN;
  if (manual) return manual;

  const stored = await loadToken();
  if (!stored) throw new Error("Pinterest not connected — authorize at /api/pinterest/auth");

  const expSoon =
    stored.expires_at && new Date(stored.expires_at).getTime() - Date.now() < 60_000;
  if (expSoon) {
    if (!stored.refresh_token) {
      throw new Error("Pinterest access token expired and no refresh token — re-authorize");
    }
    return refreshAccessToken(stored.refresh_token);
  }
  return stored.access_token;
}

// --- saved pins → NormalizedItem -------------------------------------------

interface PinImage {
  width?: number;
  height?: number;
  url: string;
}
interface Pin {
  id: string;
  created_at?: string;
  title?: string;
  description?: string;
  media?: {
    media_type?: string; // "image" | "video" | ...
    images?: Record<string, PinImage>; // size-key → image
  };
}
interface PinsPage {
  items?: Pin[];
  bookmark?: string | null;
}

/** Pick the largest available image for a pin (by pixel area). */
function largestImage(images: Record<string, PinImage> | undefined): PinImage | null {
  if (!images) return null;
  let best: PinImage | null = null;
  let bestArea = -1;
  for (const img of Object.values(images)) {
    const area = (img.width ?? 0) * (img.height ?? 0);
    // area 0 (unknown dims) still beats nothing; later larger ones win.
    if (area > bestArea || best === null) {
      best = img;
      bestArea = area;
    }
  }
  return best;
}

function pinToItem(pin: Pin): NormalizedItem | null {
  if (pin.media?.media_type && pin.media.media_type !== "image") return null; // images-only (§3)
  const img = largestImage(pin.media?.images);
  if (!img?.url) return null;
  return {
    imageUrl: img.url,
    sourceLink: `https://www.pinterest.com/pin/${pin.id}/`,
    caption: pin.title || pin.description || "",
    platform: "pinterest",
    engagementSignal: "saved",
    timestamp: pin.created_at || new Date().toISOString(),
  };
}

/**
 * Pull up to `cap` of the user's saved pins, newest first, as NormalizedItems.
 * Refreshes the token as needed. Returns [] shapes are handled by the caller.
 */
export async function fetchSavedPins(cap = 250): Promise<NormalizedItem[]> {
  const token = await getValidAccessToken();
  const out: NormalizedItem[] = [];
  let bookmark: string | null | undefined;

  while (out.length < cap) {
    const u = new URL(PINS_URL);
    u.searchParams.set("page_size", "100");
    if (bookmark) u.searchParams.set("bookmark", bookmark);

    const res = await fetch(u, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      throw new Error(`pins fetch failed (${res.status}): ${await res.text()}`);
    }
    const page = (await res.json()) as PinsPage;
    for (const pin of page.items ?? []) {
      const item = pinToItem(pin);
      if (item) out.push(item);
    }
    bookmark = page.bookmark;
    if (!bookmark) break; // last page
  }
  return out.slice(0, cap);
}
