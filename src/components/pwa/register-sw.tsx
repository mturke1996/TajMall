'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';

/**
 * Service Worker registration.
 * Provides offline app-shell caching (see public/sw.js) and update prompts.
 * Does NOT queue writes made while offline — see the note inside register()
 * below before adding a "sync-transactions" background sync.
 */
export function RegisterServiceWorker() {
  const [swStatus, setSwStatus] = useState<'idle' | 'registered' | 'updated' | 'error'>('idle');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (new URL(window.location.href).searchParams.has('nosw')) return;

    let refreshing = false;
    const hadControllerAtRegister = !!navigator.serviceWorker.controller;

    // New SW took control — reload once. Skip toast on first install (no prior controller).
    const handleControllerChange = () => {
      if (refreshing) return;
      if (!hadControllerAtRegister) return;
      refreshing = true;
      window.location.reload();
    };

    // Listen for controller changes
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
          updateViaCache: 'imports',
        });

        // Check for updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New version available
              setSwStatus('updated');
              toast.info('تحديث جديد متاح', {
                description: 'هناك نسخة جديدة من التطبيق متاحة.',
                id: 'pwa-sw-updatefound',
                action: {
                  label: 'تحديث',
                  onClick: () => {
                    newWorker.postMessage({ type: 'SKIP_WAITING' });
                  },
                },
              });
            }
          });
        });

        // Check for updates every hour
        setInterval(() => {
          registration.update();
        }, 60 * 60 * 1000);

        setSwStatus('registered');
        console.log('[PWA] Service Worker registered:', registration.scope);

        // ملاحظة: لا توجد طابور مزامنة فعلي للبيانات دون اتصال (كان هنا
        // نداء sync.register() بلا أي معالج 'sync' مطابق في sw.js — كود
        // ميت لا يفعل شيئاً). العمل دون اتصال حالياً يغطي فقط عرض الواجهة
        // المخزَّنة (app shell)، لا حفظ معاملات جديدة. أي طابور حقيقي
        // (IndexedDB + معالج sync) يحتاج تصميماً مخصصاً لتفادي التعارضات
        // في بيانات مالية.

        // Request notification permission
        if ('Notification' in window && Notification.permission === 'default') {
          // Defer permission request to avoid immediate prompt
          setTimeout(() => {
            Notification.requestPermission().then((permission) => {
              if (permission === 'granted') {
                console.log('[PWA] Notification permission granted');
              }
            });
          }, 10000);
        }
      } catch (error) {
        console.error('[PWA] Service Worker registration failed:', error);
        setSwStatus('error');
      }
    };

    // Wait for load event
    if (document.readyState === 'complete') {
      register();
    } else {
      window.addEventListener('load', register, { once: true });
    }

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, []);

  // Listen for online/offline events
  useEffect(() => {
    const handleOnline = () => {
      toast.success('تم استعادة الاتصال', {
        description: 'أصبحت متصلاً بالإنترنت مرة أخرى.',
      });
    };

    const handleOffline = () => {
      toast.warning('وضع عدم الاتصال', {
        description: 'أنت تعمل بلا اتصال — الصفحات المفتوحة تبقى متاحة، لكن حفظ بيانات جديدة يتطلب استعادة الاتصال أولاً.',
        duration: 5000,
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return null;
}

/**
 * Hook to check online status
 */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

/**
 * Hook for PWA install prompt
 */
export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstallable(false);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      toast.success('تم تثبيت التطبيق');
    }

    setDeferredPrompt(null);
    setIsInstallable(false);
  }, [deferredPrompt]);

  return { isInstallable, handleInstall };
}
