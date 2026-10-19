/**
 * Resolves Supabase env vars supporting BOTH the new publishable-key format
 * (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `sb_publishable_…`) and the
 * legacy anon-key format (`NEXT_PUBLIC_SUPABASE_ANON_KEY`). Either works.
 *
 * Returns empty string during build if vars are missing (to avoid breaking build).
 * Runtime errors will show a helpful message.
 */

function isBuildTime(): boolean {
  return process.env.NODE_ENV === 'production' && typeof window === 'undefined' && !process.env.NEXT_PUBLIC_SUPABASE_URL;
}

export function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    if (isBuildTime()) return '';
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL. Set it in Vercel environment variables.',
    );
  }
  return url;
}

export function getSupabasePublicKey(): string {
  // Prefer the new publishable key, fall back to the legacy anon key.
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!key) {
    if (isBuildTime()) return '';
    throw new Error(
      'Missing Supabase public key. Set either NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel environment variables.',
    );
  }
  return key;
}

export function getSupabaseServiceRoleKey(): string {
  const key =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    if (isBuildTime()) return '';
    throw new Error(
      'Missing Supabase service-role key. Set SUPABASE_SECRET_KEY in Vercel environment variables. Server-only — never expose to the browser.',
    );
  }
  return key;
}

/**
 * True when a request reached the app over https: the first value of the x-forwarded-proto header (set by
 * the hosting proxy) or the protocol of the request URL ("https:"). Used to mark the auth cookies Secure
 * without breaking a plain-http localhost session.
 */
export function isHttpsRequest(forwardedProto: string | null | undefined, urlProtocol?: string | null): boolean {
  const first = forwardedProto?.split(',')[0]?.trim().toLowerCase();
  if (first) return first === 'https';
  return urlProtocol === 'https:';
}
