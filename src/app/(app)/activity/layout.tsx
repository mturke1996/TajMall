import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'سجل النشاط',
  description: 'آخر المعاملات والنشاط المالي في المنظومة',
};

export default function ActivityLayout({ children }: { children: React.ReactNode }) {
  return children;
}
