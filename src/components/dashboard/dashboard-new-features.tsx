'use client';

import Link from 'next/link';
import {
  Bell,
  Landmark,
  Users,
  Coins,
  Scale,
  BookMarked,
  FolderTree,
  Sparkles,
  ChevronLeft,
  BookOpen,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatDateRelative } from '@/lib/utils';
import {
  useNotifications,
  useUnreadNotificationCount,
} from '@/lib/db/notification-queries';
import { useJournalSummary } from '@/lib/db/journal-queries';
import { useTenantCharges } from '@/lib/db/mall-queries';
import { AccountingBackfillBanner } from '@/components/accounting/accounting-backfill-banner';
import { usePermission } from '@/lib/supabase/use-permission';

const FEATURE_LINKS = [
  {
    href: '/reports/balance-sheet',
    label: 'الميزانية العمومية',
    description: 'الأصول والخصوم وحقوق الملكية',
    icon: Landmark,
    color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  },
  {
    href: '/reports/ar-aging',
    label: 'أعمار الذمم',
    description: 'تحليل متأخرات المستأجرين',
    icon: Users,
    color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
  },
  {
    href: '/mall?tab=charges',
    label: 'المطالبات والفواتير',
    description: 'فواتير PDF وتذكيرات التحصيل',
    icon: Coins,
    color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  },
  {
    href: '/accounts',
    label: 'البنود المحاسبية',
    description: 'دليل الحسابات وبنود الميزانية',
    icon: FolderTree,
    color: 'bg-sage-100 text-sage-800 dark:bg-sage-900/30 dark:text-sage-400',
  },
  {
    href: '/reports/trial-balance',
    label: 'ميزان المراجعة',
    description: 'توازن المدين والدائن',
    icon: Scale,
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
  {
    href: '/reports/ledger',
    label: 'دفتر الأستاذ',
    description: 'كشف حساب تفصيلي لكل بند',
    icon: BookMarked,
    color: 'bg-slate-100 text-slate-700 dark:bg-slate-800/50 dark:text-slate-300',
  },
] as const;

const SEVERITY_STYLES = {
  info: 'border-border bg-canvas-sunken',
  success: 'border-emerald-200 bg-emerald-50/80 dark:border-emerald-900/50',
  warning: 'border-amber-200 bg-amber-50/80 dark:border-amber-900/50',
  danger: 'border-rose-200 bg-rose-50/80 dark:border-rose-900/50',
} as const;

export function DashboardNewFeatures() {
  const { data: unread = 0, isLoading: unreadLoading } = useUnreadNotificationCount();
  const { data: notifications = [], isLoading: notifLoading } = useNotifications();
  const { data: journalSummary, isLoading: journalLoading } = useJournalSummary();
  const { data: charges = [] } = useTenantCharges();
  const { can } = usePermission();

  const unpaidCharges = charges.filter((c) => c.status === 'UNPAID').length;
  const recentAlerts = notifications.slice(0, 4);
  const showBackfill =
    !journalLoading &&
    journalSummary != null &&
    Number(journalSummary.posted_entries) === 0 &&
    (can('journal.post') || can('journal.create'));

  return (
    <section className="space-y-3" aria-label="الميزات الجديدة">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-600" />
          الميزات الجديدة
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          {!journalLoading && journalSummary != null && (
            <Badge variant="outline" className="text-[11px] font-normal gap-1">
              <BookOpen className="h-3 w-3" />
              {journalSummary.posted_entries} مرحّل
              {Number(journalSummary.draft_entries) > 0 && (
                <span className="text-amber-700 dark:text-amber-400">
                  · {journalSummary.draft_entries} مسودة
                </span>
              )}
            </Badge>
          )}
          {unpaidCharges > 0 && (
            <Badge variant="outline" className="text-[11px] font-normal text-amber-800 border-amber-200">
              {unpaidCharges} مطالبة غير مسددة
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {FEATURE_LINKS.map((item) => (
          <Link key={item.href} href={item.href} prefetch className="block h-full group">
            <div className="relative flex h-full items-center gap-3 rounded-xl border border-dashed border-sage-300/80 bg-gradient-to-br from-sage-50/90 to-card p-3.5 shadow-sm transition-all duration-200 hover:border-sage-400 hover:shadow-lift dark:from-sage-950/20 dark:border-sage-800/60">
              <span className="absolute top-2 start-2 rounded-md bg-amber-500/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                جديد
              </span>
              <div
                className={cn(
                  'mt-4 p-2.5 rounded-lg shrink-0 transition-transform group-hover:scale-105',
                  item.color,
                )}
              >
                <item.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1 pt-3">
                <p className="text-sm font-semibold group-hover:text-primary transition-colors">
                  {item.label}
                </p>
                <p className="text-[11px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">
                  {item.description}
                </p>
              </div>
              <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary transition-transform group-hover:-translate-x-0.5" />
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 md:gap-4">
        <Link href="/notifications" prefetch className="block h-full group">
          <Card className="h-full border-dashed border-sage-300/70 bg-gradient-to-br from-card to-sage-50/50 transition-all hover:shadow-lift hover:border-sage-400 dark:to-sage-950/15">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Bell className="h-4 w-4 text-sage-600" />
                    مركز الإشعارات
                  </CardTitle>
                  <CardDescription>تذكيرات المطالبات والمتابعة</CardDescription>
                </div>
                {!unreadLoading && unread > 0 && (
                  <Badge className="bg-rose-600 hover:bg-rose-600 shrink-0">
                    {unread} غير مقروء
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {notifLoading ? (
                <>
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </>
              ) : recentAlerts.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">
                  لا توجد إشعارات — ستظهر تذكيرات المتأخرات هنا
                </p>
              ) : (
                recentAlerts.map((n) => (
                  <div
                    key={n.id}
                    className={cn(
                      'rounded-lg border px-2.5 py-2 text-xs',
                      SEVERITY_STYLES[n.severity] ?? SEVERITY_STYLES.info,
                      !n.is_read && 'ring-1 ring-sage-300/50',
                    )}
                  >
                    <p className="font-medium truncate">{n.title_ar}</p>
                    <p className="text-muted-foreground mt-0.5 truncate">
                      {formatDateRelative(n.created_at)}
                    </p>
                  </div>
                ))
              )}
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs gap-1 mt-1 pointer-events-none"
                tabIndex={-1}
              >
                فتح المركز
                <ChevronLeft className="h-3 w-3" />
              </Button>
            </CardContent>
          </Card>
        </Link>
      </div>

      {showBackfill && (
        <AccountingBackfillBanner
          title="التقارير الجديدة تحتاج قيوداً مرحّلة"
          description="بعد ترحيل المعاملات القديمة ستظهر بيانات الميزانية وأعمار الذمم وميزان المراجعة."
        />
      )}
    </section>
  );
}
