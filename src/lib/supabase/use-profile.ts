'use client';

import { useQuery } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from './client';
import { useUser } from './use-user';
import type { ProfileRow } from '@/lib/db/types';

/**
 * Loads the signed-in row from `public.profiles` alongside Supabase Auth.
 */
export function useCurrentProfile() {
  const { user, loading: authLoading } = useUser();

  const query = useQuery({
    queryKey: ['profile', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data as ProfileRow | null) ?? null;
    },
  });

  return {
    user,
    profile: query.data ?? null,
    loading: authLoading || (Boolean(user?.id) && query.isLoading),
    refetchProfile: query.refetch,
  };
}
