'use client';

import { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { ChevronLeft } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { usePermission } from '@/lib/supabase/use-permission';
import type { PermissionKey } from '@/lib/constants';
import { cn } from '@/lib/utils';

type Item = { title: string; desc: string; href: string; permission?: PermissionKey };

/** Only pages that exist and that the user may open. */
const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: 'الحساب',
    items: [{ title: 'الملف الشخصي وكلمة المرور', desc: 'اسمك كما يظهر في السجل، وتغيير كلمة المرور.', href: '/profile' }],
  },
  {
    title: 'الفريق والصلاحيات',
    items: [
      { title: 'المستخدمون', desc: 'دعوة مستخدم جديد وتعيين دوره.', href: '/users', permission: 'org.users' },
      { title: 'الأدوار والصلاحيات', desc: 'ما يستطيع كل دور رؤيته وتسجيله.', href: '/roles', permission: 'org.roles' },
      { title: 'الفروع', desc: 'فروع المنشأة المسجّلة.', href: '/branches', permission: 'org.branches' },
      { title: 'سجل الرقابة', desc: 'كل تعديل مع اسم من قام به والرصيد بعده.', href: '/audit-log', permission: 'org.audit' },
    ],
  },
  {
    title: 'المحاسبة والخزائن',
    items: [
      { title: 'البنود المحاسبية', desc: 'بنود الإيرادات والمصروفات وربطها بالحسابات.', href: '/accounts', permission: 'account.view' },
      { title: 'الفترات المالية', desc: 'إقفال الأشهر والترحيل السنوي.', href: '/reports/periods', permission: 'journal.view' },
      { title: 'الخزائن والمصارف', desc: 'الخزائن والحسابات المصرفية وأرصدتها.', href: '/cashboxes', permission: 'cashbox.view' },
      { title: 'جرد الخزائن', desc: 'عدّ فعلي للنقد وتسوية الفرق مع الدفتر.', href: '/settings/cashbox-count', permission: 'cashbox.manage' },
    ],
  },
  {
    title: 'البيانات',
    items: [{ title: 'النسخ الاحتياطي', desc: 'تنزيل نسخة من البيانات إلى جهازك.', href: '/settings/backup', permission: 'org.settings' }],
  },
];

const THEMES = [
  { value: 'light', label: 'فاتح' },
  { value: 'dark', label: 'داكن' },
  { value: 'system', label: 'حسب الجهاز' },
] as const;

const subscribeNoop = () => () => {};

function ThemeSetting() {
  const { theme, setTheme } = useTheme();
  // the stored theme is only known in the browser
  const isClient = useSyncExternalStore(subscribeNoop, () => true, () => false);
  return (
    <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-[14px] font-medium text-foreground">المظهر</p>
        <p className="mt-0.5 text-[12.5px] text-ink-mute">ألوان الواجهة على هذا الجهاز.</p>
      </div>
      <div className="flex w-fit rounded-lg border border-border bg-canvas-sunken p-0.5" role="group" aria-label="المظهر">
        {THEMES.map((t) => {
          const active = isClient && theme === t.value;
          return (
            <button
              key={t.value}
              type="button"
              aria-pressed={active}
              onClick={() => setTheme(t.value)}
              className={cn(
                'h-8 rounded-md px-3 text-[13px] font-medium transition-colors',
                active ? 'bg-card text-foreground shadow-xs' : 'text-ink-mute hover:text-foreground',
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { can, loading } = usePermission();
  const groups = GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((it) => !it.permission || (!loading && can(it.permission))),
  })).filter((g) => g.items.length > 0);

  return (
    <>
      <PageHeader title="الإعدادات" description="الحساب والفريق والمحاسبة والبيانات." />

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-5 sm:px-5 sm:py-6 md:px-8 md:py-7">
        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-[12.5px] font-medium text-ink-mute">الواجهة</h2>
          <div className="surface overflow-hidden">
            <ThemeSetting />
          </div>
        </section>

        {groups.map((group) => (
          <section key={group.title} className="flex flex-col gap-2">
            <h2 className="px-1 text-[12.5px] font-medium text-ink-mute">{group.title}</h2>
            <ul className="surface divide-y divide-border overflow-hidden">
              {group.items.map((it) => (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-canvas-sunken/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-medium text-foreground">{it.title}</span>
                      <span className="mt-0.5 block text-[12.5px] text-ink-mute">{it.desc}</span>
                    </span>
                    <ChevronLeft className="h-4 w-4 shrink-0 text-ink-mute" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
