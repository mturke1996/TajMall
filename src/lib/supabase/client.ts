import { createBrowserClient } from '@supabase/ssr';
import { getSupabaseUrl, getSupabasePublicKey } from './env';

/**
 * Browser-side Supabase client.
 * Use inside Client Components and React hooks only.
 *
 * The session cookies are written from here too (sign-in happens in the browser), so they get the Secure
 * flag whenever the page is on https. It is decided per call from the page's own protocol, which keeps a
 * plain-http localhost session working.
 */
export function createSupabaseBrowserClient() {
  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:';
  return createBrowserClient(
    getSupabaseUrl(),
    getSupabasePublicKey(),
    secure ? { cookieOptions: { secure: true } } : undefined,
  );
}
