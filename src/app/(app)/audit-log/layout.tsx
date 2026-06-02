import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'سجل الرقابة',
};

export default function AuditLogLayout({ children }: { children: React.ReactNode }) {
  return children;
}
