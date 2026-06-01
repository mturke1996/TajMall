'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { peopleSegmentHref } from '@/lib/mall/routes';

function EmployeesRedirectInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const extra: Record<string, string> = {};
    const add = searchParams.get('add');
    if (add) extra.add = add;
    router.replace(peopleSegmentHref('EMPLOYEE', extra));
  }, [router, searchParams]);

  return (
    <div className="flex h-48 items-center justify-center gap-2 text-ink-mute">
      <Loader2 className="h-5 w-5 animate-spin" />
      جارٍ التحويل…
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
