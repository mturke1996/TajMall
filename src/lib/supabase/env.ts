/**
 * Resolves Supabase env vars supporting BOTH the new publishable-key format
 * (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `sb_publishable_…`) and the
 * legacy anon-key format (`NEXT_PUBLIC_SUPABASE_ANON_KEY`). Either works.
 *
 * Throws clearly at runtime if neither is set, so misconfiguration is loud.
 */

export function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL. Set it in .env.local.',
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
    throw new Error(
      'Missing Supabase public key. Set either NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (new format) or NEXT_PUBLIC_SUPABASE_ANON_KEY (legacy) in .env.local.',
    );
  }
  return key;
}

export function getSupabaseServiceRoleKey(): string {
  const key =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      'Missing Supabase service-role key. Set SUPABASE_SECRET_KEY (new) or SUPABASE_SERVICE_ROLE_KEY (legacy) in .env.local. Server-only — never expose to the browser.',
    );
  }
  return key;
}
