"use client";

import { useCurrentProfile } from './use-profile';
import { can as canHelper, normalizeRole, type SystemRole } from '@/lib/permissions';
import type { PermissionKey } from '@/lib/constants';

/**
 * Hook to retrieve current user role and perform dynamic frontend permission checks.
 */
export function usePermission() {
  const { profile, loading, user } = useCurrentProfile();

  const userRole = profile?.role ?? 'viewer';
  const role = normalizeRole(userRole);

  return {
    loading,
    role: role as SystemRole,
    /** المشاهد: قراءة وتقارير فقط */
    isViewer: !loading && Boolean(user) && role === 'viewer',
    /** أي دور يستطيع إضافة/تعديل/حذف بيانات تشغيلية */
    canWrite: !loading && Boolean(user) && role !== 'viewer',
    can: (key: PermissionKey) => {
      if (loading) return false;
      if (!user) return false;
      return canHelper(userRole, key);
    },
    hasProfileRow: Boolean(profile),
  };
}
