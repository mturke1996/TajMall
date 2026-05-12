import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import {
  getSupabaseUrl,
  getSupabasePublicKey,
  getSupabaseServiceRoleKey,
} from './env';

type CookieItem = { name: string; value: string; options?: CookieOptions };

/**
 * Server-side Supabase client bound to the incoming request's cookie jar.
 * Use inside Server Components, Route Handlers, and Server Actions.
 */
export function createSupabaseServerClient() {
  const cookieStore = cookies();
  return createServerClient(getSupabaseUrl(), getSupabasePublicKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(items: CookieItem[]) {
        try {
          items.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
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
