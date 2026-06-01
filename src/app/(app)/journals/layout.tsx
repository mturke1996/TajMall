import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';

export default function JournalsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AccountingPageShell>{children}</AccountingPageShell>;
}
