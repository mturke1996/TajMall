'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  prefetchAppData,
  APP_DATA_WARM_KEY,
} from '@/lib/db/prefetch-app-data';
import { useNotificationsRealtime } from '@/lib/db/notification-queries';
import { BootstrapSplash } from './bootstrap-splash';

function isSessionWarm(): boolean {
  try {
    return sessionStorage.getItem(APP_DATA_WARM_KEY) === '1';
  } catch {
    return false;
  }
}

function markSessionWarm(): void {
  try {
    sessionStorage.setItem(APP_DATA_WARM_KEY, '1');
  } catch {
    /* private mode */
  }
}

/**
 * يسخّن ذاكرة الاستعلام عند فتح التطبيق.
 * أول زيارة في الجلسة: شاشة تجهيز قصيرة ثم واجهة كاملة بدون spinners متكررة.
 * الزيارات التالية: عرض فوري + تحديث في الخلفية.
 */
export function AppDataBootstrap({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(false);

  // نشط طوال وجود المستخدم داخل التطبيق — يحدّث الإشعارات فوراً بدل
  // انتظار سحب يدوي.
  useNotificationsRealtime();

  useEffect(() => {
    let cancelled = false;

    if (isSessionWarm()) {
      setReady(true);
      void prefetchAppData(queryClient);
      return;
    }

    void prefetchAppData(queryClient).then(() => {
      if (cancelled) return;
      markSessionWarm();
      setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [queryClient]);

  if (!ready) {
    return <BootstrapSplash />;
  }

  return <>{children}</>;
}
