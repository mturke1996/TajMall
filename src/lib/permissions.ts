import type { PermissionKey } from '@/lib/constants';

/**
 * Normalized workspace roles (stored in `profiles.role`).
 * Legacy `member` (القيمة الافتراضية في مخطط 001) يُعامل كـ أمين تشغيل حتى لا يُقفل
 * المستخدمون من إضافة إيرادات/مصروفات قبل ترحيل 002 أو تعيين دور صريح.
 */
export type SystemRole = 'owner' | 'admin' | 'accountant' | 'cashier' | 'viewer';

const ALL: PermissionKey[] = [
  'dashboard.view',
  'revenue.view',
  'revenue.create',
  'revenue.update',
  'revenue.delete',
  'revenue.post',
  'expense.view',
  'expense.create',
  'expense.update',
  'expense.delete',
  'expense.post',
  'cashbox.view',
  'cashbox.manage',
  'account.view',
  'account.manage',
  'journal.view',
  'journal.create',
  'journal.post',
  'journal.reverse',
  'voucher.view',
  'voucher.create',
  'voucher.approve',
  'voucher.post',
  'voucher.cancel',
  'report.view',
  'report.export',
  'org.settings',
  'org.branches',
  'org.users',
  'org.roles',
  'org.audit',
];

export function normalizeRole(role: string | null | undefined): SystemRole {
  const r = (role ?? 'viewer').toLowerCase().trim();
  if (r === 'member') return 'cashier';
  if (r === 'owner' || r === 'admin' || r === 'accountant' || r === 'cashier' || r === 'viewer') {
    return r;
  }
  return 'viewer';
}

function groupOf(key: PermissionKey): string {
  return key.split('.')[0];
}

/**
 * Mirrors the RBAC matrix on `/roles` (owner/admin full access; accountant no org; etc.).
 */
export function can(role: string | null | undefined, key: PermissionKey): boolean {
  const r = normalizeRole(role);
  if (r === 'owner' || r === 'admin') return true;

  const g = groupOf(key);

  if (r === 'viewer') {
    if (key === 'report.export') return false;
    const suffix = key.split('.')[1];
    return suffix === 'view' || key === 'dashboard.view';
  }

  if (r === 'accountant') {
    if (g === 'org') return false;
    return ALL.includes(key);
  }

  if (r === 'cashier') {
    if (g === 'revenue' || g === 'expense' || g === 'voucher') return true;
    if (g === 'cashbox') return key === 'cashbox.manage' || key === 'cashbox.view';
    if (g === 'journal') return key === 'journal.view';
    if (g === 'dashboard') return key === 'dashboard.view';
    if (g === 'account') return key === 'account.view';
    if (g === 'report') return key === 'report.view';
    return false;
  }

  return false;
}
