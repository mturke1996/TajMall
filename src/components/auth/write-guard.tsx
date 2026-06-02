'use client';

import type { PermissionKey } from '@/lib/constants';
import { usePermission } from '@/lib/supabase/use-permission';

type WriteGuardProps = {
  children: React.ReactNode;
  /** صلاحية محددة؛ وإلا يُستخدم canWrite (أي دور غير المشاهد) */
  permission?: PermissionKey;
};

/** يخفي الأزرار والإجراءات عن المشاهد ومن لا يملك الصلاحية. */
export function WriteGuard({ children, permission }: WriteGuardProps) {
  const { can, canWrite, loading } = usePermission();

  if (loading) return null;
  if (permission ? !can(permission) : !canWrite) return null;

  return <>{children}</>;
}
