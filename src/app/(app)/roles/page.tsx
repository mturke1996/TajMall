'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Shield, Users, Check } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { SYSTEM_ROLES, PERMISSION_KEYS } from '@/lib/constants';
import { useProfiles } from '@/lib/db/queries';
import { usePermission } from '@/lib/supabase/use-permission';
import { cn } from '@/lib/utils';

const ROLE_DESCRIPTIONS: Record<string, string> = {
  owner: 'صلاحيات كاملة لكل وحدات النظام بدون استثناء.',
  admin: 'إدارة المستخدمين والفروع والإعدادات والقيود.',
  accountant: 'إنشاء وإدارة القيود والإيرادات والمصروفات والتقارير.',
  cashier: 'تنفيذ الإيرادات والمصروفات النقدية اليومية.',
  viewer: 'الاطلاع فقط على البيانات والتقارير دون أي تعديل.',
};

const PERMISSION_GROUPS = (() => {
  const map: Record<string, string[]> = {};
  PERMISSION_KEYS.forEach((k) => {
    const group = k.split('.')[0];
    if (!map[group]) map[group] = [];
    map[group].push(k);
  });
  return map;
})();

const GROUP_LABELS: Record<string, string> = {
  dashboard: 'لوحة التحكم',
  revenue: 'الإيرادات',
  expense: 'المصروفات',
  cashbox: 'الخزائن',
  account: 'الحسابات',
  journal: 'القيود',
  voucher: 'الإذونات',
  org: 'الإدارة',
};

type Access = 'full' | 'view' | 'none';

function roleAccess(roleName: string, group: string): Access {
  const hasFull =
    roleName === 'owner' ||
    roleName === 'admin' ||
    (roleName === 'accountant' && group !== 'org') ||
    (roleName === 'cashier' &&
      ['revenue', 'expense', 'voucher', 'cashbox'].includes(group));
  if (hasFull) return 'full';
  const hasView =
    roleName === 'viewer' ||
    (roleName === 'cashier' && ['dashboard', 'account', 'journal'].includes(group));
  return hasView ? 'view' : 'none';
}

export default function RolesPage() {
  const { data: profiles } = useProfiles();
  const { can, loading: permLoading } = usePermission();
  const mayViewRoles = can('org.roles') || can('org.users');

  const countByRole = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of SYSTEM_ROLES) m.set(r.name, 0);
    for (const p of profiles ?? []) {
      const key = (p.role ?? 'viewer').toLowerCase();
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return m;
  }, [profiles]);

  if (permLoading) {
    return (
      <>
        <PageHeader eyebrow="الإدارة" title="الأدوار والصلاحيات" />
        <p className="px-4 py-8 text-sm text-ink-mute sm:px-8">جاري التحقق من الصلاحيات…</p>
      </>
    );
  }

  if (!mayViewRoles) {
    return (
      <>
        <PageHeader eyebrow="الإدارة" title="الأدوار والصلاحيات" />
        <p className="px-4 py-8 text-sm text-pastel-redInk sm:px-8">
          غير مصرّح — تحتاج صلاحية إدارة الأدوار أو المستخدمين.
        </p>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="الإدارة"
        title="الأدوار والصلاحيات"
        description="مصفوفة الصلاحيات الحالية للأدوار النظامية (للعرض). تعديل الأدوار المخصصة غير متاح بعد."
      />

      <div className="flex flex-col gap-6 px-4 py-5 sm:px-5 sm:py-6 md:gap-7 md:px-8 md:py-7">
        <section className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
          {SYSTEM_ROLES.map((r, i) => (
            <motion.div
              key={r.name}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="surface flex flex-col gap-3 p-4 transition-shadow duration-200 hover:shadow-whisper sm:p-5"
            >
              <div className="flex items-start justify-between">
                <span className="grid h-9 w-9 place-items-center rounded-md border border-border bg-canvas-sunken text-sage-700">
                  <Shield className="h-[15px] w-[15px] stroke-[1.5]" />
                </span>
                <Badge variant="neutral" className="gap-1 normal-case tracking-normal">
                  <Users className="h-3 w-3 stroke-[1.6]" />
                  {countByRole.get(r.name) ?? 0}
                </Badge>
              </div>
              <div>
                <h3 className="text-[14px] font-semibold text-ink">{r.nameAr}</h3>
                <p className="mt-1 text-[12px] leading-relaxed text-ink-mute">
                  {ROLE_DESCRIPTIONS[r.name] ?? ''}
                </p>
              </div>
            </motion.div>
          ))}
        </section>

        <section className="surface overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-start text-[12.5px]">
            <thead>
              <tr className="border-b border-border bg-canvas-sunken/60">
                <th className="px-3 py-2.5 text-start font-medium text-ink-mute">المجموعة</th>
                {SYSTEM_ROLES.map((r) => (
                  <th key={r.name} className="px-2 py-2.5 text-center font-medium text-ink-mute">
                    {r.nameAr}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(PERMISSION_GROUPS).map(([group, keys]) => (
                <tr key={group} className="border-b border-border/70">
                  <td className="px-3 py-2.5 font-medium text-ink">
                    {GROUP_LABELS[group] ?? group}
                    <span className="ms-1 text-[11px] font-normal text-ink-mute">
                      ({keys.length})
                    </span>
                  </td>
                  {SYSTEM_ROLES.map((r) => {
                    const access = roleAccess(r.name, group);
                    return (
                      <td key={r.name} className="px-2 py-2.5 text-center">
                        <span
                          className={cn(
                            'inline-flex items-center justify-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px]',
                            access === 'full' && 'bg-pastel-green text-pastel-greenInk',
                            access === 'view' && 'bg-pastel-blue text-pastel-blueInk',
                            access === 'none' && 'bg-canvas-sunken text-ink-mute',
                          )}
                        >
                          {access === 'full' && <Check className="h-3 w-3 stroke-[2]" />}
                          {access === 'full' ? 'كامل' : access === 'view' ? 'عرض' : '—'}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
