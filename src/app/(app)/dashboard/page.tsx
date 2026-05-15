import { AdvancedDashboard } from '@/components/dashboard/advanced-dashboard';

export const metadata = { 
  title: 'لوحة التحكم',
  description: 'نظرة عامة على الأداء المالي والتشغيلي'
};

export default function DashboardPage() {
  return <AdvancedDashboard />;
}
