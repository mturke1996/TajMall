'use client';

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { User } from '@supabase/supabase-js';
import { createSupabaseBrowserClient } from './client';

const AUTH_USER_KEY = ['auth-user'] as const;

/**
 * Reactive Supabase user hook.
 *
 * Returns the currently authenticated user (or null) and a loading flag.
 * Every caller shares one cached `getUser()` request — usePermission alone mounts this hook in a
 * dozen components per page, and each used to make its own round trip to Supabase Auth.
 * onAuthStateChange writes into the same cache, so sign-in/sign-out from any tab is reflected
 * immediately — no manual refresh needed.
 */
export function useUser() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: AUTH_USER_KEY,
    queryFn: async (): Promise<User | null> => {
      const { data } = await createSupabaseBrowserClient().auth.getUser();
      return data.user ?? null;
    },
  });

  useEffect(() => {
    const { data: sub } = createSupabaseBrowserClient().auth.onAuthStateChange((event, session) => {
      // INITIAL_SESSION comes from local storage and is not verified; the getUser() query is.
      if (event === 'INITIAL_SESSION') return;
      const next = session?.user ?? null;
      const prev = queryClient.getQueryData<User | null>(AUTH_USER_KEY);
      // Sign-out navigates client-side, so cached rows (payroll lines, balances…) would otherwise
      // be shown to the next account that signs in on this tab until they went stale.
      if (event === 'SIGNED_OUT' || (prev && next && prev.id !== next.id)) queryClient.clear();
      queryClient.setQueryData<User | null>(AUTH_USER_KEY, next);
    });
    return () => sub.subscription.unsubscribe();
  }, [queryClient]);

  return { user: query.data ?? null, loading: query.isPending };
}
