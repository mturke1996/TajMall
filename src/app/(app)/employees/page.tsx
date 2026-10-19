'use client';

import { Suspense, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { peopleSegmentHref } from '@/lib/mall/routes';

function EmployeesRedirectInner() {
  const router = useRouter();

  // Redirect once: depending on useSearchParams() re-ran this when its identity changed and sent a
  // second replace after the people panel had already consumed `add`.
  useEffect(() => {
    const add = new URLSearchParams(window.location.search).get('add');
    router.replace(peopleSegmentHref('EMPLOYEE', { add: add || 'EMPLOYEE' }));
  }, [router]);

  return (
    <div role="status" className="flex h-48 items-center justify-center gap-2 text-ink-mute">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      جارٍ التحويل إلى قائمة الموظفين
    </div>
  );
}

export default function EmployeesRedirectPage() {
  return (
    <Suspense fallback={null}>
      <EmployeesRedirectInner />
    </Suspense>
  );
}
