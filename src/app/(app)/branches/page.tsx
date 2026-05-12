import { Plus, Building2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/data/empty-state';

export default function BranchesPage() {
  const branches: Array<{ id: string }> = [];

  return (
    <>
      <PageHeader
        eyebrow="الإدارة"
        title="الفروع"
        description="إدارة الفروع التابعة للمنشأة. كل فرع له معاملاته وأرصدته وتقاريره المستقلة."
        actions={
          <Button size="sm" className="gap-1.5">
            <Plus className="stroke-[1.6]" />
            فرع جديد
          </Button>
        }
      />

      <div className="flex flex-col gap-6 px-5 py-7 md:px-8 md:py-10">
        {branches.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="لا توجد فروع بعد"
            description="أنشئ المركز الرئيسي للمنشأة، ثم أضف فروعاً تابعة حسب الحاجة. كل فرع له خزائنه وموظفوه وتقاريره."
            action={{ label: 'إنشاء فرع جديد', href: '/branches/new' }}
          />
        ) : null}
      </div>
    </>
  );
}
