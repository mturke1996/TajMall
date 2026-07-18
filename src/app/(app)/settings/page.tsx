import {
  Building2,
  Coins,
  Globe2,
  Palette,
  Shield,
  Database,
  Bell,
  KeyRound,
  ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';

const GROUPS = [
  {
    title: 'المنظمة',
    items: [
      {
        icon: Building2,
        title: 'بيانات المنشأة',
        desc: 'الاسم، الشعار، العنوان، الرقم الضريبي.',
        href: '/settings/organization',
      },
      {
        icon: Coins,
        title: 'العملة والمحاسبة',
        desc: 'العملة الافتراضية، الفترة المالية، أرقام القيود.',
        href: '/settings/accounting',
      },
      {
        icon: Globe2,
        title: 'اللغة والمنطقة',
        desc: 'العربية / الإنجليزية، التقويم، المنطقة الزمنية.',
        href: '/settings/locale',
      },
    ],
  },
  {
    title: 'المظهر والأمان',
    items: [
      {
        icon: Palette,
        title: 'المظهر',
        desc: 'الألوان، الخطوط، شكل التقارير المطبوعة.',
        href: '/settings/appearance',
      },
      {
        icon: Shield,
        title: 'الأمان',
        desc: 'كلمة المرور، التحقق الثنائي، الجلسات النشطة.',
        href: '/profile#password',
      },
      {
        icon: KeyRound,
        title: 'مفاتيح API',
        desc: 'مفاتيح للربط مع الأنظمة الخارجية.',
        href: '/settings/api-keys',
      },
    ],
  },
  {
    title: 'النظام',
    items: [
      {
        icon: Bell,
        title: 'الإشعارات',
        desc: 'البريد الإلكتروني، إشعارات الويب، تنبيهات النظام.',
        href: '/settings/notifications',
      },
      {
        icon: Database,
        title: 'النسخ الاحتياطي',
        desc: 'تصدير قاعدة البيانات واستيرادها.',
        href: '/settings/backup',
      },
    ],
  },
];

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        eyebrow="الإعدادات"
        title="إعدادات المنظومة"
        description="خصّص المنظومة لتعمل بالطريقة المثالية لعملك."
      />

      <div className="flex flex-col gap-6 px-4 py-5 sm:px-5 sm:py-6 md:gap-7 md:px-8 md:py-7">
        {GROUPS.map((group) => (
          <section key={group.title} className="flex flex-col gap-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-mute">
              {group.title}
            </h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {group.items.map((it) => {
                const Icon = it.icon;
                return (
                  <Link
                    key={it.title}
                    href={it.href}
                    className="surface group flex items-start gap-3 p-4 transition-shadow duration-200 hover:shadow-whisper sm:gap-4 sm:p-5"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-border bg-canvas-sunken text-sage-700">
                      <Icon className="h-[16px] w-[16px] stroke-[1.5]" />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <h3 className="text-[14px] font-semibold tracking-tight">
                        {it.title}
                      </h3>
                      <p className="text-[12.5px] leading-[1.55] text-ink-mute">
                        {it.desc}
                      </p>
                    </div>
                    <ArrowLeft className="mt-1 h-4 w-4 shrink-0 stroke-[1.5] text-ink-mute transition-transform duration-200 group-hover:-translate-x-0.5 group-hover:text-foreground" />
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
