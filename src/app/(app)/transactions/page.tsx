'use client';

import { useMemo, useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { DataToolbar } from '@/components/data/toolbar';
import { TransactionsTable } from '@/components/data/transactions-table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { NewTransactionButton } from '@/components/transactions/new-transaction-button';
import { useTransactions } from '@/lib/db/queries';

export default function TransactionsPage() {
  const [query, setQuery] = useState('');
  const { data, isLoading } = useTransactions();

  const filtered = useMemo(() => {
    const rows = data ?? [];
    if (!query) return rows;
    const q = query.toLowerCase();
    return rows.filter(
      (r) =>
        (r.description ?? '').toLowerCase().includes(q) ||
        (r.category?.name_ar ?? '').includes(query) ||
        (r.reference ?? String(r.number)).includes(query),
    );
  }, [data, query]);

  const revenues = filtered.filter((r) => r.kind === 'REVENUE');
  const expenses = filtered.filter((r) => r.kind === 'EXPENSE');

  return (
    <>
      <PageHeader
        eyebrow="المعاملات"
        title="جميع المعاملات"
        description="إيرادات ومصروفات ومعاملات الخزائن في مكان واحد."
        actions={<NewTransactionButton />}
      />

      <div className="flex flex-col gap-5 px-4 py-5 sm:px-5 sm:py-7 md:px-8 md:py-10">
        <Tabs defaultValue="all">
          <TabsList>
            <TabsTrigger value="all">
              <ArrowLeftRight />
              الكل ({filtered.length})
            </TabsTrigger>
            <TabsTrigger value="revenues">الإيرادات ({revenues.length})</TabsTrigger>
            <TabsTrigger value="expenses">المصروفات ({expenses.length})</TabsTrigger>
          </TabsList>

          <div className="mt-4">
            <DataToolbar
              searchPlaceholder="ابحث في رقم القيد أو البيان أو البند…"
              count={filtered.length}
              onSearch={setQuery}
              onExport={() => {}}
            />
          </div>

          <TabsContent value="all" className="mt-4">
            <TransactionsTable rows={filtered} loading={isLoading} />
          </TabsContent>
          <TabsContent value="revenues" className="mt-4">
            <TransactionsTable
              rows={revenues}
              loading={isLoading}
              kindFilter="REVENUE"
            />
          </TabsContent>
          <TabsContent value="expenses" className="mt-4">
            <TransactionsTable
              rows={expenses}
              loading={isLoading}
              kindFilter="EXPENSE"
            />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
