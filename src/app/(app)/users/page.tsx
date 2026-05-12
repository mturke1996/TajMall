import { Plus, Users } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/data/empty-state';

export default function UsersPage() {
  const users: Array<{ id: string }> = [];

  return (
    <>
      <PageHeader
        eyebrow="الإدارة"
        title="المستخدمون"
        description="إدارة فريق العمل، الصلاحيات، والاتصال بالنظام."
        actions={
          <Button size="sm" className="gap-1.5">
            <Plus className="stroke-[1.6]" />
            دعوة مستخدم
          </Button>
        }
      />

      <div className="flex flex-col gap-6 px-5 py-7 md:px-8 md:py-10">
        {users.length === 0 ? (
          <EmptyState
            icon={Users}
            title="لا يوجد مستخدمون آخرون بعد"
            description="ادعُ أعضاء فريقك للوصول إلى المنظومة. يمكنك تخصيص دور لكل مستخدم وتحديد الفرع الذي يعمل به."
            action={{ label: 'دعوة مستخدم جديد', href: '/users/new' }}
          />
        ) : null}
      </div>
    </>
  );
}
