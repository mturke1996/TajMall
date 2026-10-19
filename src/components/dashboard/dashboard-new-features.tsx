'use client';

import Link from 'next/link';
import { Bell, BookMarked, ChevronLeft, Coins, FolderTree, Landmark, Scale, Users, type LucideIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { arabicCount, cn, formatDateRelative } from '@/lib/utils';
import { useNotifications, useUnreadNotificationCount } from '@/lib/db/notification-queries';
import { useJournalSummary } from '@/lib/db/journal-queries';
import { useTenantRentSummary } from '@/lib/db/queries';
import { aggregateMallRentKpis } from '@/lib/mall-rent-kpis';
import { AccountingBackfillBanner } from '@/components/accounting/accounting-backfill-banner';
import { usePermission } from '@/lib/supabase/use-permission';

const SHORTCUTS: Array<{ href: string; label: string; description: string; icon: LucideIcon }> = [
  { href: '/reports/balance-sheet', label: 'الميزانية العمومية', description: 'الأصول والخصوم وحقوق الملكية', icon: Landmark },
  { href: '/reports/ar-aging', label: 'أعمار الذمم', description: 'متأخرات المستأجرين حسب المدة', icon: Users },
  { href: '/mall?tab=charges', label: 'المطالبات', description: 'فواتير الإيجار وتذكيرات التحصيل', icon: Coins },
  { href: '/reports/trial-balance', label: 'ميزان المراجعة', description: 'توازن المدين والدائن', icon: Scale },
  { href: '/reports/ledger', label: 'دفتر الأستاذ', description: 'حركة كل بند بالتفصيل', icon: BookMarked },
  { href: '/accounts', label: 'دليل الحسابات', description: 'البنود وتصنيفها', icon: FolderTree },
];

const SEVERITY_DOT: Record<string, string> = {
  info: 'bg-ink-mute',
  success: 'bg-pastel-greenInk',
  warning: 'bg-pastel-yellowInk',
  danger: 'bg-pastel-redInk',
};

/** Dashboard footer: report shortcuts, the latest alerts, and the ledger backfill prompt when needed. */
export function DashboardNewFeatures() {
  const { data: unread = 0, isLoading: unreadLoading } = useUnreadNotificationCount();
  const { data: notifications = [], isLoading: notifLoading } = useNotifications();
  const { data: journalSummary, isLoading: journalLoading } = useJournalSummary();
  // the same cached summary the rent card reads, so the count matches it and costs no extra request
  const { data: tenants = [] } = useTenantRentSummary();
  const { can } = usePermission();

  const openCharges = aggregateMallRentKpis(tenants).openChargesCount;
  const recentAlerts = notifications.slice(0, 4);
  const showBackfill =
    !journalLoading &&
    journalSummary != null &&
    Number(journalSummary.posted_entries) === 0 &&
    (can('journal.post') || can('journal.create'));

  return (
    <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_22rem]" aria-label="اختصارات وتنبيهات">
      <div className="flex flex-col gap-3">
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-[13px] font-semibold text-foreground">اختصارات التقارير</h3>
          <p className="text-[12px] text-muted-foreground tabular-nums">
            {!journalLoading && journalSummary != null && (
              <>
                {Number(journalSummary.posted_entries).toLocaleString('en-US')} قيد مرحّل
                {Number(journalSummary.draft_entries) > 0 && ` · ${journalSummary.draft_entries} مسودة`}
              </>
            )}
            {openCharges > 0 &&
              ` · ${arabicCount(openCharges, ['مطالبة واحدة مفتوحة', 'مطالبتان مفتوحتان', 'مطالبات مفتوحة', 'مطالبة مفتوحة'])}`}
          </p>
        </header>
        <ul className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 xl:grid-cols-3">
          {SHORTCUTS.map((item) => (
            <li key={item.href} className="bg-card">
              <Link
                href={item.href}
                prefetch
                className="group flex h-full items-center gap-3 px-4 py-3.5 transition-colors duration-100 hover:bg-canvas-sunken focus-visible:bg-canvas-sunken focus-visible:outline-hidden"
              >
                <item.icon className="h-[18px] w-[18px] shrink-0 stroke-[1.5] text-muted-foreground group-hover:text-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-medium text-foreground">{item.label}</span>
                  <span className="block truncate text-[12px] text-muted-foreground">{item.description}</span>
                </span>
                <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground/60 group-hover:text-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-3">
        <header className="flex items-baseline justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
            <Bell className="h-4 w-4 stroke-[1.5] text-muted-foreground" />
            آخر التنبيهات
          </h3>
          {!unreadLoading && unread > 0 && (
            <span className="rounded-full bg-pastel-red px-2 text-[11.5px] font-medium leading-5 text-pastel-redInk tabular-nums">
              {unread} غير مقروء
            </span>
          )}
        </header>
        <div className="flex flex-1 flex-col rounded-xl border border-border bg-card">
          {notifLoading ? (
            <div className="flex flex-col gap-2 p-3">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : recentAlerts.length === 0 ? (
            <p className="flex flex-1 items-center justify-center px-4 py-8 text-center text-[12.5px] text-muted-foreground">
              لا توجد تنبيهات. ستظهر هنا تذكيرات المتأخرات.
            </p>
          ) : (
            <ul className="divide-y divide-border/70">
              {recentAlerts.map((n) => (
                <li key={n.id} className="flex items-start gap-2.5 px-3.5 py-2.5">
                  <span
                    className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', SEVERITY_DOT[n.severity] ?? SEVERITY_DOT.info)}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className={cn('block truncate text-[12.5px]', !n.is_read && 'font-semibold')}>{n.title_ar}</span>
                    <span className="block text-[11.5px] text-muted-foreground">{formatDateRelative(n.created_at)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/notifications"
            className="mt-auto flex items-center justify-center gap-1 border-t border-border px-3 py-2.5 text-[12.5px] text-muted-foreground transition-colors duration-100 hover:bg-canvas-sunken hover:text-foreground"
          >
            كل التنبيهات
            <ChevronLeft className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {showBackfill && (
        <div className="lg:col-span-2">
          <AccountingBackfillBanner
            title="التقارير تحتاج قيوداً مرحّلة"
            description="بعد ترحيل المعاملات القديمة تظهر بيانات الميزانية وأعمار الذمم وميزان المراجعة."
          />
        </div>
      )}
    </section>
  );
}
