import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';

export default function ReportsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AccountingPageShell>{children}</AccountingPageShell>;
}
