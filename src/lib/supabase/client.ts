import { createBrowserClient } from '@supabase/ssr';
import { getSupabaseUrl, getSupabasePublicKey } from './env';

/**
 * Browser-side Supabase client.
 * Use inside Client Components and React hooks only.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(getSupabaseUrl(), getSupabasePublicKey());
}
