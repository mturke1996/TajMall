'use client';

import { Suspense, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { peopleSegmentHref } from '@/lib/mall/routes';

function CustomersRedirectInner() {
  const router = useRouter();

  useEffect(() => {
    router.replace(peopleSegmentHref('CUSTOMER', { add: 'CUSTOMER' }));
  }, [router]);

  return (
    <div className="flex h-48 items-center justify-center gap-2 text-ink-mute">
      <Loader2 className="h-5 w-5 animate-spin" />
      جارٍ التحويل…
    </div>
  );
}

export default function CustomersRedirectPage() {
  return (
    <Suspense fallback={null}>
      <CustomersRedirectInner />
    </Suspense>
  );
}
