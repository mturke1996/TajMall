import { Activity } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/data/empty-state';

export default function ActivityPage() {
  return (
    <>
      <PageHeader
        eyebrow="النشاط المباشر"
        title="سجل النشاط"
        description="جميع الإجراءات التي تمت في المنظومة بالترتيب الزمني، مفيد للمتابعة والتدقيق."
      />

      <div className="flex flex-col gap-6 px-5 py-7 md:px-8 md:py-10">
        <EmptyState
          icon={Activity}
          title="لا يوجد نشاط بعد"
          description="سيظهر هنا سجل تفصيلي بكل إنشاء، تعديل، حذف، تسجيل دخول وترحيل قيد في المنظومة."
        />
      </div>
    </>
  );
}
