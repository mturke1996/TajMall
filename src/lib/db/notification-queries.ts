'use client';

import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

export type AppNotificationRow = {
  id: string;
  kind: string;
  title_ar: string;
  body_ar: string | null;
  href: string | null;
  severity: 'info' | 'warning' | 'danger' | 'success';
  entity_type: string | null;
  entity_id: string | null;
  is_read: boolean;
  created_at: string;
};

export const nqk = {
  all: ['app_notifications'] as const,
  unreadCount: ['app_notifications', 'unread_count'] as const,
};

export function useNotifications() {
  return useQuery<AppNotificationRow[]>({
    queryKey: nqk.all,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('app_notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data as AppNotificationRow[]) ?? [];
    },
  });
}

export function useUnreadNotificationCount() {
  return useQuery<number>({
    queryKey: nqk.unreadCount,
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { count, error } = await supabase
        .from('app_notifications')
        .select('*', { count: 'exact', head: true })
        .eq('is_read', false);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from('app_notifications')
        .update({ is_read: true })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: nqk.all });
      qc.invalidateQueries({ queryKey: nqk.unreadCount });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from('app_notifications')
        .update({ is_read: true })
        .eq('is_read', false);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: nqk.all });
      qc.invalidateQueries({ queryKey: nqk.unreadCount });
    },
  });
}

/**
 * يشترك في تغييرات جدول app_notifications عبر Supabase Realtime — يستبدل
 * السحب اليدوي (فتح الصفحة / إعادة التحميل) بتحديث فوري لعدّاد غير
 * المقروء والقائمة، ويُظهر إشعار toast عند وصول تذكير جديد.
 *
 * يجب تفعيل الجدول في نشرة supabase_realtime أولاً (migration 041) وإلا
 * سيتصل القناة بنجاح لكنها لن تستقبل أي حدث أبداً (فشل صامت).
 */
export function useNotificationsRealtime() {
  const qc = useQueryClient();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    const channel = supabase
      .channel('app_notifications_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'app_notifications' },
        (payload) => {
          const row = payload.new as AppNotificationRow;
          qc.invalidateQueries({ queryKey: nqk.all });
          qc.invalidateQueries({ queryKey: nqk.unreadCount });
          if (row?.title_ar) {
            toast.info(row.title_ar, {
              description: row.body_ar ?? undefined,
            });
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'app_notifications' },
        () => {
          qc.invalidateQueries({ queryKey: nqk.all });
          qc.invalidateQueries({ queryKey: nqk.unreadCount });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc]);
}

export function useSyncOverdueChargeReminders() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc('sync_overdue_charge_notifications');
      if (error) throw error;
      return data as { created?: number };
    },
    onSuccess: (res) => {
      const n = Number(res?.created ?? 0);
      toast.success(n > 0 ? `تم إنشاء ${n} تذكيراً جديداً` : 'لا توجد مطالبات متأخرة جديدة للتذكير');
      qc.invalidateQueries({ queryKey: nqk.all });
      qc.invalidateQueries({ queryKey: nqk.unreadCount });
    },
    onError: (err: { message?: string }) => {
      toast.error(err.message ?? 'فشل مزامنة التذكيرات — طبّق هجرة 019');
    },
  });
}
