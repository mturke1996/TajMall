'use client';

import { Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { MallTabNav, MALL_TAB_META } from '@/components/mall/mall-tab-nav';
import { MallOverviewPanel } from '@/components/mall/panels/overview-panel';
import { MallTenantsPanel } from '@/components/mall/panels/tenants-panel';
import { MallUnitsPanel } from '@/components/mall/panels/units-panel';
import { MallContractsPanel } from '@/components/mall/panels/contracts-panel';
import { MallChargesPanel } from '@/components/mall/panels/charges-panel';
import { MallPeoplePanel } from '@/components/mall/panels/people-panel';
import { isMallTab, type MallTab } from '@/lib/mall/routes';
import { mallTabHref } from '@/lib/mall/routes';

const PEOPLE_PAGE_HEADERS: Record<string, { label: string; description: string }> = {
  VENDOR: { label: 'الموردون', description: 'من يُدفع لهم: كهرباء ومياه وبضاعة وخدمات' },
  CUSTOMER: { label: 'العملاء والمؤجرون', description: 'من يُقبض منهم، ومؤجرو المول' },
  EMPLOYEE: { label: 'الموظفون', description: 'الرواتب والإجازات والسلف' },
};

function MallHubContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get('tab');
  const activeTab: MallTab = isMallTab(rawTab) ? rawTab : 'overview';

  const baseMeta = MALL_TAB_META.find((t) => t.id === activeTab) ?? MALL_TAB_META[0];
  // inside the people tab the page is named after the list the owner opened from the sidebar
  const segment = searchParams.get('segment');
  const meta = (activeTab === 'people' && segment && PEOPLE_PAGE_HEADERS[segment]) || baseMeta;

  const setTab = useCallback(
    (tab: MallTab) => {
      router.push(mallTabHref(tab), { scroll: false });
    },
    [router],
  );

  return (
    <>
      <PageHeader
        eyebrow="إدارة المول"
        title={meta.label}
        description={meta.description}
      />

      <MallTabNav active={activeTab} onChange={setTab} />

      <div className="px-4 py-4 sm:px-5 sm:py-6 md:px-8 md:py-8">
        {activeTab === 'overview' && <MallOverviewPanel onNavigate={setTab} />}
        {activeTab === 'tenants' && <MallTenantsPanel />}
        {activeTab === 'units' && <MallUnitsPanel />}
        {activeTab === 'contracts' && <MallContractsPanel />}
        {activeTab === 'charges' && <MallChargesPanel />}
        {activeTab === 'people' && <MallPeoplePanel />}
      </div>
    </>
  );
}

export function MallHub() {
  return (
    <Suspense
      fallback={
        <div className="flex h-40 items-center justify-center gap-2 text-ink-mute">
          <Loader2 className="h-4 w-4 animate-spin" />
          جارٍ التحميل…
        </div>
      }
    >
      <MallHubContent />
    </Suspense>
  );
}
