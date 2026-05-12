import { Bell } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/data/empty-state';

export default function NotificationsPage() {
  return (
    <>
      <PageHeader
        eyebrow="الإشعارات"
        title="مركز الإشعارات"
        description="كل التنبيهات والأحداث الهامة في المنظومة."
      />

      <div className="flex flex-col gap-6 px-5 py-7 md:px-8 md:py-10">
        <EmptyState
          icon={Bell}
          title="لا توجد إشعارات بعد"
          description="ستظهر هنا تنبيهات النظام: ترحيل القيود، إذونات الصرف بانتظار الاعتماد، ومتغيرات الأرصدة الهامة."
        />
      </div>
    </>
  );
}
