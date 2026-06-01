'use client';

import { Suspense, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { peopleSegmentHref } from '@/lib/mall/routes';

function VendorsRedirectInner() {
  const router = useRouter();

  useEffect(() => {
    router.replace(peopleSegmentHref('VENDOR', { add: 'VENDOR' }));
  }, [router]);

  return (
    <div className="flex h-48 items-center justify-center gap-2 text-ink-mute">
      <Loader2 className="h-5 w-5 animate-spin" />
      جارٍ التحويل…
    </div>
  );
}

export default function VendorsRedirectPage() {
  return (
    <Suspense fallback={null}>
      <VendorsRedirectInner />
    </Suspense>
  );
}
