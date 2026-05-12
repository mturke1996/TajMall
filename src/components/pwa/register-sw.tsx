'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker on the client.
 * Quietly no-ops in unsupported browsers and during local dev when
 * `?nosw` is in the URL (handy for debugging).
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (new URL(window.location.href).searchParams.has('nosw')) return;

    const register = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .catch(() => {
          // Silent — we don't want a failed SW registration to block the app.
        });
    };

    // Wait for `load` so the SW install doesn't compete with the main bundle.
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);

  return null;
}
