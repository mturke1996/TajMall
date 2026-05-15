'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';

/**
 * Advanced Service Worker Registration
 * Provides offline support, background sync, and push notifications
 */
export function RegisterServiceWorker() {
  const [swStatus, setSwStatus] = useState<'idle' | 'registered' | 'updated' | 'error'>('idle');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (new URL(window.location.href).searchParams.has('nosw')) return;

    let refreshing = false;

    // Handle controller change (new SW activated)
    const handleControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      
      toast.success('تحديث متاح', {
        description: 'تم تحديث التطبيق. سيتم تحديث الصفحة تلقائياً.',
        action: {
          label: 'تحديث الآن',
          onClick: () => window.location.reload(),
        },
      });
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

        // Register for background sync if available
        if ('sync' in registration) {
          try {
            await registration.sync.register('sync-transactions');
          } catch (syncError) {
            console.log('[PWA] Background sync not available');
          }
        }

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
      // Trigger sync when back online
      if ('serviceWorker' in navigator && 'sync' in navigator.serviceWorker) {
        navigator.serviceWorker.ready.then((registration) => {
          registration.sync.register('sync-transactions');
        });
      }
    };

    const handleOffline = () => {
      toast.warning('وضع عدم الاتصال', {
        description: 'أنت تعمل في وضع عدم الاتصال. سيتم مزامنة البيانات عند استعادة الاتصال.',
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
