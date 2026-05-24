"use client";

import { useCurrentProfile } from './use-profile';
import { can as canHelper, type SystemRole } from '@/lib/permissions';
import type { PermissionKey } from '@/lib/constants';

/**
 * Hook to retrieve current user role and perform dynamic frontend permission checks.
 */
export function usePermission() {
  const { profile, loading, user } = useCurrentProfile();

  const userRole = profile?.role ?? 'viewer';

  return {
    loading,
    role: userRole as SystemRole,
    can: (key: PermissionKey) => {
      if (loading) return false;
      if (!user) return false;
      return canHelper(userRole, key);
    },
    hasProfileRow: Boolean(profile),
  };
}
