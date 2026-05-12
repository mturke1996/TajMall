import { Plus, Landmark } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/data/empty-state';

export default function VendorsPage() {
  const vendors: Array<{ id: string }> = [];

  return (
    <>
      <PageHeader
        eyebrow="بيانات أساسية"
        title="الموردون"
        description="قاعدة بيانات الموردين وأرصدة الذمم الدائنة."
        actions={
          <Button size="sm" className="gap-1.5">
            <Plus className="stroke-[1.6]" />
            مورد جديد
          </Button>
        }
      />

      <div className="flex flex-col gap-6 px-5 py-7 md:px-8 md:py-10">
        {vendors.length === 0 ? (
          <EmptyState
            icon={Landmark}
            title="لا يوجد موردون بعد"
            description="أضف موردي البضائع والخدمات لتربط بهم المصروفات وإذونات الصرف وتدير ذممهم."
            action={{ label: 'إضافة مورد جديد', href: '/vendors/new' }}
          />
        ) : null}
      </div>
    </>
  );
}
