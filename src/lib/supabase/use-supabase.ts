'use client';

import { useMemo } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * Stable browser Supabase client for components that call `auth`/realtime/etc.
 */
export function useSupabase(): SupabaseClient {
  return useMemo(() => createSupabaseBrowserClient(), []);
}
