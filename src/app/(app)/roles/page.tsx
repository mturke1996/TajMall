'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Shield, Plus, Users, Check } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SYSTEM_ROLES, PERMISSION_KEYS } from '@/lib/constants';
import { useProfiles } from '@/lib/db/queries';
import { cn } from '@/lib/utils';

const ROLE_DESCRIPTIONS: Record<string, string> = {
  owner:      'صلاحيات كاملة لكل وحدات النظام بدون استثناء.',
  admin:      'إدارة المستخدمين والفروع والإعدادات والقيود.',
  accountant: 'إنشاء وإدارة القيود والإيرادات والمصروفات والتقارير.',
  cashier:    'تنفيذ الإيرادات والمصروفات النقدية اليومية.',
  viewer:     'الاطلاع فقط على البيانات والتقارير دون أي تعديل.',
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
  revenue:   'الإيرادات',
  expense:   'المصروفات',
  cashbox:   'الخزائن',
  account:   'الحسابات',
  journal:   'القيود',
  voucher:   'الإذونات',
  org:       'الإدارة',
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

  const countByRole = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of SYSTEM_ROLES) m.set(r.name, 0);
    for (const p of profiles ?? []) {
      const key = (p.role ?? 'viewer').toLowerCase();
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return m;
  }, [profiles]);

  return (
    <>
      <PageHeader
        eyebrow="الإدارة"
        title="الأدوار والصلاحيات"
        description="نظام RBAC مرن لتخصيص الصلاحيات لكل دور. هذه القوائم قابلة للتعديل لاحقاً."
        actions={
          <Button size="sm" className="gap-1.5">
            <Plus className="stroke-[1.6]" />
            دور جديد
          </Button>
        }
      />

      <div className="flex flex-col gap-7 px-5 py-7 md:px-8 md:py-10">
        <section className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
          {SYSTEM_ROLES.map((r, i) => (
            <motion.div
              key={r.name}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="surface flex flex-col gap-3 p-5 transition-shadow duration-200 hover:shadow-whisper"
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
              <h3 className="text-[15px] font-semibold tracking-tight">{r.nameAr}</h3>
              <p className="text-[12.5px] leading-[1.6] text-ink-mute">
                {ROLE_DESCRIPTIONS[r.name]}
              </p>
              <div className="border-t border-border pt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-mute">
                {r.name}
              </div>
            </motion.div>
          ))}
        </section>

        <article className="surface overflow-hidden">
          <div className="border-b border-border px-6 py-4">
            <h3 className="text-[15px] font-semibold tracking-tight">مصفوفة الصلاحيات</h3>
            <p className="mt-1 text-[12.5px] text-ink-mute">
              نظرة سريعة على ما يمكن لكل دور فعله. القيم الافتراضية مقترحة ويمكن تعديلها.
            </p>
          </div>
          {/* Mobile: per-group cards */}
          <ul className="flex flex-col divide-y divide-border md:hidden">
            {Object.keys(PERMISSION_GROUPS).map((group) => (
              <li key={group} className="px-4 py-3.5">
                <p className="mb-2.5 text-[13px] font-semibold">
                  {GROUP_LABELS[group] ?? group}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {SYSTEM_ROLES.map((r) => {
                    const access = roleAccess(r.name, group);
                    return (
                      <span
                        key={r.name}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11.5px] font-medium',
                          access === 'full' &&
                            'border-transparent bg-pastel-green text-pastel-greenInk',
                          access === 'view' &&
                            'border-transparent bg-pastel-blue text-pastel-blueInk',
                          access === 'none' &&
                            'border-border bg-canvas-sunken text-ink-mute',
                        )}
                      >
                        {access === 'full' && <Check className="h-3 w-3 stroke-[2]" />}
                        {r.nameAr}
                        {access === 'view' && (
                          <span className="text-[9.5px] opacity-80">قراءة</span>
                        )}
                        {access === 'none' && (
                          <span className="text-[9.5px] opacity-70">—</span>
                        )}
                      </span>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop: matrix table */}
          <div className="hidden overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] md:block">
            <table className="w-full min-w-[720px] text-[13px]">
              <thead>
                <tr className="bg-canvas-sunken">
                  <th className="px-4 py-2.5 text-start text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-mute">
                    المجموعة
                  </th>
                  {SYSTEM_ROLES.map((r) => (
                    <th
                      key={r.name}
                      className="px-4 py-2.5 text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-mute"
                    >
                      {r.nameAr}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.keys(PERMISSION_GROUPS).map((group) => (
                  <tr key={group} className="border-b border-border">
                    <td className="px-4 py-2.5 font-medium">
                      {GROUP_LABELS[group] ?? group}
                    </td>
                    {SYSTEM_ROLES.map((r) => {
                      const hasFull =
                        r.name === 'owner' ||
                        r.name === 'admin' ||
                        (r.name === 'accountant' && group !== 'org') ||
                        (r.name === 'cashier' &&
                          ['revenue', 'expense', 'voucher', 'cashbox'].includes(group));
                      const hasView =
                        hasFull ||
                        r.name === 'viewer' ||
                        (r.name === 'cashier' &&
                          ['dashboard', 'account', 'journal'].includes(group));
                      return (
                        <td key={r.name} className="px-4 py-2.5 text-center">
                          {hasFull ? (
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-pastel-green text-pastel-greenInk">
                              <Check className="h-3.5 w-3.5 stroke-[1.8]" />
                            </span>
                          ) : hasView ? (
                            <span className="inline-flex h-6 items-center rounded-md bg-pastel-blue px-2 text-[10px] font-medium text-pastel-blueInk">
                              قراءة
                            </span>
                          ) : (
                            <span className="text-ink-mute">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </div>
    </>
  );
}
