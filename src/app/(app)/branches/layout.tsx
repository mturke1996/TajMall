import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'الفروع',
  description: 'عرض وإدارة فروع المنشأة',
};

export default function BranchesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
