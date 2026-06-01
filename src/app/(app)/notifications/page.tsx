'use client';

import Link from 'next/link';
import { Bell, Loader2, CheckCheck, RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/data/empty-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn, formatDate } from '@/lib/utils';
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useSyncOverdueChargeReminders,
} from '@/lib/db/notification-queries';

const SEVERITY: Record<string, string> = {
  info: 'border-slate-200 bg-slate-50',
  warning: 'border-amber-200 bg-amber-50',
  danger: 'border-red-200 bg-red-50',
  success: 'border-green-200 bg-green-50',
};

export default function NotificationsPage() {
  const { data: items = [], isLoading, isError } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const syncReminders = useSyncOverdueChargeReminders();

  const unread = items.filter((n) => !n.is_read);

  return (
    <>
      <PageHeader
        eyebrow="الإشعارات"
        title="مركز الإشعارات"
        description="تذكيرات المطالبات المتأخرة وتنبيهات التشغيل."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={syncReminders.isPending}
              onClick={() => syncReminders.mutate()}
              className="gap-1.5 touch-manipulation"
            >
              <RefreshCw className={cn('h-4 w-4', syncReminders.isPending && 'animate-spin')} />
              مزامنة المتأخرات
            </Button>
            {unread.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                disabled={markAll.isPending}
                onClick={() => markAll.mutate()}
                className="gap-1.5 touch-manipulation"
              >
                <CheckCheck className="h-4 w-4" />
                قراءة الكل
              </Button>
            )}
          </div>
        }
      />

      <div className="flex flex-col gap-4 px-4 py-5 sm:px-5 sm:py-7 md:px-8 md:py-10">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <EmptyState
            icon={Bell}
            title="تعذّر تحميل الإشعارات"
            description="طبّق هجرة 019_manual_allocations_and_notifications.sql على Supabase."
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="لا توجد إشعارات"
            description="اضغط «مزامنة المتأخرات» لإنشاء تذكيرات للمطالبات المتأخرة."
            action={{ label: 'مزامنة الآن', onClick: () => syncReminders.mutate() }}
          />
        ) : (
          <ul className="space-y-2">
            {items.map((n) => (
              <li
                key={n.id}
                className={cn(
                  'rounded-xl border p-4 transition-opacity',
                  SEVERITY[n.severity] ?? SEVERITY.info,
                  n.is_read && 'opacity-60',
                )}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-sm">{n.title_ar}</p>
                      {!n.is_read && (
                        <Badge variant="outline" className="text-[10px]">
                          جديد
                        </Badge>
                      )}
                    </div>
                    {n.body_ar && (
                      <p className="text-xs text-muted-foreground leading-relaxed">{n.body_ar}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground">{formatDate(n.created_at)}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {n.href && (
                      <Button variant="outline" size="sm" asChild className="touch-manipulation">
                        <Link href={n.href}>فتح</Link>
                      </Button>
                    )}
                    {!n.is_read && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={markRead.isPending}
                        onClick={() => markRead.mutate(n.id)}
                        className="touch-manipulation"
                      >
                        تمت القراءة
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
