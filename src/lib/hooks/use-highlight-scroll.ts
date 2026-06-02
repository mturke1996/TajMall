'use client';

import { useEffect } from 'react';

/** تمرير لعنصر مُميَّز بعد تحميل الصفحة (مثلاً من سجل الرقابة). */
export function useHighlightScroll(
  highlightId: string | null | undefined,
  domId: (id: string) => string,
  deps: unknown[] = [],
) {
  useEffect(() => {
    if (!highlightId) return;
    const elId = domId(highlightId);
    const timer = window.setTimeout(() => {
      document.getElementById(elId)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 350);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightId, ...deps]);
}

export function isHighlighted(
  highlightId: string | null | undefined,
  rowId: string,
): boolean {
  return Boolean(highlightId && highlightId === rowId);
}
