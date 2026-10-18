import { notFound } from 'next/navigation';
import { PayrollPreview } from './payroll-preview';

/** Development-only preview of the payroll screens with fictional data (no sign-in, no database). */
export default function PayrollPreviewPage({ searchParams }: { searchParams: { tab?: string } }) {
  if (process.env.NODE_ENV === 'production') notFound();
  return <PayrollPreview initialTab={searchParams.tab ?? 'run'} />;
}
