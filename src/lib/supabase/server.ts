import { cookies, headers } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import {
  getSupabaseUrl,
  getSupabasePublicKey,
  getSupabaseServiceRoleKey,
  isHttpsRequest,
} from './env';

type CookieItem = { name: string; value: string; options?: CookieOptions };

/**
 * Server-side Supabase client bound to the incoming request's cookie jar.
 * Use inside Server Components, Route Handlers, and Server Actions.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  // the auth cookies carry the session: mark them Secure whenever the request came in over https
  // (Vercel terminates TLS and says so in x-forwarded-proto), and leave plain-http localhost alone
  const secure = isHttpsRequest((await headers()).get('x-forwarded-proto'));
  return createServerClient(getSupabaseUrl(), getSupabasePublicKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(items: CookieItem[]) {
        try {
          items.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, secure ? { ...options, secure: true } : options);
          });
        } catch {
          // Called from a Server Component (read-only context) — safe to ignore;
          // the middleware refreshes the session anyway.
        }
      },
    },
  });
}

/**
 * Privileged server-side client (service-role key).
 * Bypasses RLS — use ONLY in trusted server code, never in API routes that
 * accept unauthenticated input without explicit guards.
 */
export function createSupabaseAdminClient() {
  return createServerClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    cookies: {
      getAll() {
        return [];
      },
      setAll() {
        // service-role client never writes cookies
      },
    },
  });
}
