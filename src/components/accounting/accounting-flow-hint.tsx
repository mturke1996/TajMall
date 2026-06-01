'use client';

import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { ACCOUNTING_NAV_ITEMS } from '@/lib/accounting-nav';
import { usePathname } from 'next/navigation';

/** يوضح الخطوة التالية في سير العمل المحاسبي (شاشات متوسطة فأكبر) */
export function AccountingFlowHint() {
  const pathname = usePathname();
  const current = ACCOUNTING_NAV_ITEMS.find(
    (i) => pathname === i.href || pathname.startsWith(`${i.href}/`),
  );
  if (!current) return null;

  const next = ACCOUNTING_NAV_ITEMS.find((i) => i.step === current.step + 1);
  if (!next) return null;

  return (
    <div className="rounded-xl border border-dashed border-sage-200 bg-sage-50/60 px-3 py-2.5 text-xs flex flex-wrap items-center justify-between gap-2">
      <span className="text-sage-900 min-w-0">
        الخطوة التالية: <strong>{next.labelAr}</strong>
      </span>
      <Link
        href={next.href}
        className="inline-flex shrink-0 items-center gap-1 font-semibold text-sage-800 hover:underline touch-manipulation min-h-9 px-1"
      >
        انتقل
        <ChevronLeft className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
