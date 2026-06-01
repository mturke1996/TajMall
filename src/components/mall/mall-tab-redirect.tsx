'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import type { MallTab } from '@/lib/mall/routes';
import { mallTabHref } from '@/lib/mall/routes';

export function MallTabRedirect({
  tab,
  preserveSearch,
}: {
  tab: MallTab;
  preserveSearch?: boolean;
}) {
  const router = useRouter();

  useEffect(() => {
    const extra =
      preserveSearch && typeof window !== 'undefined'
        ? Object.fromEntries(new URLSearchParams(window.location.search))
        : undefined;
    if (extra?.tab) {
      if (extra.tab === 'directory') extra.tab = 'people';
      delete extra.tab;
    }
    router.replace(mallTabHref(tab, extra));
  }, [router, tab, preserveSearch]);

  return (
    <div className="flex h-48 items-center justify-center gap-2 text-ink-mute">
      <Loader2 className="h-5 w-5 animate-spin" />
      جارٍ التحويل…
    </div>
  );
}
