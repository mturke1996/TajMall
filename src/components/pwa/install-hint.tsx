'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Share, Plus, X } from 'lucide-react';
import { BRAND } from '@/lib/brand';

const DISMISS_KEY = 'fluxen.ios-install.dismissed';

/**
 * iOS "Add to Home Screen" hint.
 *
 * iOS Safari never fires `beforeinstallprompt`, so the standard install
 * banner pattern doesn't reach iPhone users. This component:
 *
 *   1. Detects iOS Safari that is NOT already in standalone mode.
 *   2. Shows a one-time, dismissible bottom toast explaining the steps.
 *   3. Remembers dismissal in localStorage.
 *
 * Silent on every other platform and after standalone install.
 */
export function InstallHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const ua = window.navigator.userAgent.toLowerCase();
    const isIos = /iphone|ipad|ipod/.test(ua);
    const isSafari = /safari/.test(ua) && !/(crios|fxios|opios|edgios)/.test(ua);
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS legacy
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window.navigator as any).standalone === true;

    const dismissed = window.localStorage.getItem(DISMISS_KEY) === '1';

    if (isIos && isSafari && !isStandalone && !dismissed) {
      // Wait a beat so the toast doesn't fight the page paint.
      const t = setTimeout(() => setShow(true), 1200);
      return () => clearTimeout(t);
    }
  }, []);

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* localStorage may be unavailable in private mode */
    }
    setShow(false);
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.aside
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
          role="status"
          className="
            pointer-events-auto fixed inset-x-3 bottom-3 z-40
            flex items-start gap-3 rounded-2xl border border-border bg-card p-3.5
            shadow-lift sm:bottom-5 sm:end-5 sm:start-auto sm:max-w-sm
          "
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 14px)' }}
          dir="rtl"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-sage-700 text-[14px] font-bold text-sand-50">
            {BRAND.monogram}
          </span>

          <div className="flex flex-1 flex-col gap-1.5">
            <h3 className="text-[13.5px] font-semibold tracking-tight">
              ثبّت {BRAND.name} على شاشتك الرئيسية
            </h3>
            <p className="text-[12px] leading-[1.55] text-ink-mute">
              اضغط
              <span className="mx-1 inline-flex items-center gap-0.5">
                <Share className="h-3 w-3 stroke-[1.7] text-pastel-blueInk" />
                «مشاركة»
              </span>
              ثم
              <span className="mx-1 inline-flex items-center gap-0.5">
                <Plus className="h-3 w-3 stroke-[1.7] text-pastel-greenInk" />
                «إضافة إلى الشاشة الرئيسية»
              </span>
              لتشغيلها كتطبيق كامل.
            </p>
          </div>

          <button
            type="button"
            onClick={dismiss}
            className="press grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink-mute transition-colors duration-150 hover:bg-secondary hover:text-foreground"
            aria-label="إخفاء التنبيه"
          >
            <X className="h-3.5 w-3.5 stroke-[1.6]" />
          </button>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
