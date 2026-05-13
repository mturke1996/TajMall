'use client';

/**
 * صلاحيات مفتوحة - أي مستخدم مسجل يمكنه كل شيء
 */
export function usePermission() {
  return {
    loading: false,
    role: 'cashier' as const,
    can: () => true,
    hasProfileRow: true,
  };
}
