'use client';

import type { CategoryRow, TransactionWithRelations } from '@/lib/db/types';
import { TransactionsReportOptionsDialog } from './options/transactions-report-options-dialog';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: CategoryRow[];
  transactions: TransactionWithRelations[];
  defaultCategoryId?: string;
};

/** «خيارات تقرير PDF المتقدمة» of the expenses page: the shared transactions report dialog, set to expenses. */
export function ExpensesPdfDialog(props: Props) {
  return <TransactionsReportOptionsDialog kind="EXPENSE" {...props} />;
}
