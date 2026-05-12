import { Plus, Coins } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/data/empty-state';

export default function CustomersPage() {
  const customers: Array<{ id: string }> = [];

  return (
    <>
      <PageHeader
        eyebrow="بيانات أساسية"
        title="العملاء"
        description="قاعدة بيانات العملاء وأرصدتهم."
        actions={
          <Button size="sm" className="gap-1.5">
            <Plus className="stroke-[1.6]" />
            عميل جديد
          </Button>
        }
      />

      <div className="flex flex-col gap-6 px-5 py-7 md:px-8 md:py-10">
        {customers.length === 0 ? (
          <EmptyState
            icon={Coins}
            title="لا يوجد عملاء بعد"
            description="أضف عملاءك لتربط معاملات الإيرادات بهم وتتبع أرصدتهم بسهولة."
            action={{ label: 'إضافة عميل جديد', href: '/customers/new' }}
          />
        ) : null}
      </div>
    </>
  );
}
