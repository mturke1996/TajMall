'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Receipt,
  BookOpen,
  Plus,
  Search,
  Loader2,
  FileText,
  CheckCircle2,
  Clock,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  ArrowDownLeft,
  ArrowUpRight,
  TrendingDown,
  TrendingUp,
  Layers,
  Printer,
  ExternalLink,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn, formatMoney, formatDate } from '@/lib/utils';
import type { ContactRow, TransactionWithRelations } from '@/lib/db/types';
import type { JournalEntryRow } from '@/lib/db/journal-queries';
import { TransactionsTable } from '@/components/data/transactions-table';
import { MobileTransactionList } from '@/components/data/mobile-transaction-list';
import { JournalVoucherTable } from '@/components/accounting/journal-voucher-table';
import { JournalBalanceBadge } from '@/components/accounting/journal-balance-badge';
import { mapJournalLineRowToVoucherLine } from '@/lib/journal-entry-display';
import { useJournalLines } from '@/lib/db/journal-queries';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';
import { buildJournalEntriesForPdf } from '@/lib/journal-pdf';
import { useTxDialog } from '@/stores/transaction-dialog';
import { usePermission } from '@/lib/supabase/use-permission';
import { extractContactBusinessRole } from '@/lib/contacts/contact-roles';

type Props = {
  contact: ContactRow;
  transactions: TransactionWithRelations[];
  journalEntries: JournalEntryRow[];
  txLoading?: boolean;
  jeLoading?: boolean;
};

function JournalEntryRowItem({ entry }: { entry: JournalEntryRow }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { data: lines = [], isLoading: linesLoading } = useJournalLines(entry.id);


  const voucherLines = useMemo(() => {
    return lines.map(mapJournalLineRowToVoucherLine);
  }, [lines]);

  const isBalanced =
    Number(entry.total_debit || 0) === Number(entry.total_credit || 0);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden transition-all shadow-2xs">
      <div
        className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:bg-muted/30"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-canvas-sunken text-foreground">
            <BookOpen className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-xs text-foreground font-mono">
                قيد #{entry.number}
              </span>
              <Badge
                variant="outline"
                className={cn(
                  'text-[10px] px-1.5 py-0.2 gap-1',
                  entry.status === 'POSTED'
                    ? 'border-success-line text-success-ink bg-success-soft'
                    : entry.status === 'DRAFT'
                    ? 'border-warning-line text-warning-ink bg-warning-soft'
                    : 'border-danger-line text-danger-ink bg-danger-soft'
                )}
              >
                {entry.status === 'POSTED' ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : (
                  <Clock className="h-3 w-3" />
                )}
                {entry.status === 'POSTED'
                  ? 'مرحّل'
                  : entry.status === 'DRAFT'
                  ? 'مسودة'
                  : 'معكوس'}
              </Badge>
              {isBalanced ? (
                <Badge className="bg-success-soft text-success-ink text-[10px]">
                  متوازن
                </Badge>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {entry.description || 'بدون بيان'} ·{' '}
              <span className="font-mono">{formatDate(entry.entry_date)}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 justify-between sm:justify-end shrink-0" onClick={(e) => e.stopPropagation()}>
          <div className="text-end font-mono">
            <span className="text-xs text-muted-foreground block">إجمالي القيد</span>
            <span className="text-sm font-bold text-foreground">
              {formatMoney(Number(entry.total_debit || 0), 'LYD')}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <TajMallPdfToolbar
              fileName={`قيد-محاسبي-${entry.number}`}
              render={async () => {
                const { JournalPDF } = await import('@/features/pdf/JournalPDF');
                const pdfEntries = await buildJournalEntriesForPdf([entry]);
                return (
                  <JournalPDF
                    entries={pdfEntries}
                    periodLabel={`القيد المحاسبي رقم ${entry.number}`}
                  />
                );
              }}
            />

            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-border bg-canvas-sunken/40 p-4">
          {linesLoading ? (
            <div className="flex items-center justify-center py-6 text-xs text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              جاري جلب أطراف القيد المحاسبي المزدوج…
            </div>
          ) : voucherLines.length === 0 ? (
            <p className="text-xs text-muted-foreground py-3 text-center">
              لا توجد بنود مسجلة لهذا القيد
            </p>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">
                  تفاصيل أطراف القيد المزدوج (مدين / دائن)
                </span>
                <JournalBalanceBadge
                  debit={entry.total_debit}
                  credit={entry.total_credit}
                />

              </div>
              <JournalVoucherTable
                lines={voucherLines}
                totalDebit={entry.total_debit}
                totalCredit={entry.total_credit}
                density="compact"
                className="bg-card rounded-lg border border-border"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ContactLedgerPanel({
  contact,
  transactions,
  journalEntries,
  txLoading = false,
  jeLoading = false,
}: Props) {
  const [activeTab, setActiveTab] = useState<'transactions' | 'journals'>(
    'transactions'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const openTx = useTxDialog((s) => s.open);
  const { can } = usePermission();
  const role = extractContactBusinessRole(contact);

  const revenueTxs = useMemo(
    () => transactions.filter((t) => t.kind === 'REVENUE'),
    [transactions]
  );
  const expenseTxs = useMemo(
    () => transactions.filter((t) => t.kind === 'EXPENSE' || t.kind == null),
    [transactions]
  );

  const totalInflow = useMemo(
    () => revenueTxs.reduce((s, t) => s + Number(t.amount || 0), 0),
    [revenueTxs]
  );
  const totalOutflow = useMemo(
    () => expenseTxs.reduce((s, t) => s + Number(t.amount || 0), 0),
    [expenseTxs]
  );
  const netBalance = totalInflow - totalOutflow;

  const filteredTransactions = useMemo(() => {
    if (!searchQuery.trim()) return transactions;
    const q = searchQuery.toLowerCase();
    return transactions.filter(
      (t) =>
        t.description?.toLowerCase().includes(q) ||
        t.category?.name_ar?.toLowerCase().includes(q) ||
        t.cashbox?.name_ar?.toLowerCase().includes(q) ||
        String(t.number).includes(q) ||
        String(t.amount).includes(q)
    );
  }, [transactions, searchQuery]);

  const filteredJournalEntries = useMemo(() => {
    if (!searchQuery.trim()) return journalEntries;
    const q = searchQuery.toLowerCase();
    return journalEntries.filter(
      (je) =>
        je.description?.toLowerCase().includes(q) ||
        String(je.number).includes(q) ||
        String(je.total_debit).includes(q)
    );
  }, [journalEntries, searchQuery]);

  const isPayable =
    role === 'LANDLORD' ||
    role === 'SUPPLIER_ELECTRICITY' ||
    role === 'SUPPLIER_WATER' ||
    role === 'SUPPLIER_GOODS' ||
    role === 'SERVICE_PROVIDER' ||
    role === 'EMPLOYEE';

  return (
    <div className="space-y-6">
      {/* 1. Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-4 border-border bg-card">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">إجمالي المقبوضات</span>
            <ArrowDownLeft className="h-4 w-4 text-success" />
          </div>
          <p className="text-lg font-bold text-success-ink font-mono">
            {formatMoney(totalInflow, 'LYD')}
          </p>
          <span className="text-[10px] text-muted-foreground mt-0.5 block">
            {revenueTxs.length} سند قبض
          </span>
        </Card>

        <Card className="p-4 border-border bg-card">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">إجمالي المدفوعات</span>
            <ArrowUpRight className="h-4 w-4 text-danger" />
          </div>
          <p className="text-lg font-bold text-danger-ink font-mono">
            {formatMoney(totalOutflow, 'LYD')}
          </p>
          <span className="text-[10px] text-muted-foreground mt-0.5 block">
            {expenseTxs.length} سند صرف
          </span>
        </Card>

        <Card className="p-4 border-border bg-card">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">صافي رصيد الحركة</span>
            {netBalance >= 0 ? (
              <TrendingUp className="h-4 w-4 text-success" />
            ) : (
              <TrendingDown className="h-4 w-4 text-warning" />
            )}
          </div>
          <p
            className={cn(
              'text-lg font-bold font-mono',
              netBalance >= 0
                ? 'text-success-ink'
                : 'text-warning-ink'
            )}
          >
            {formatMoney(netBalance, 'LYD')}
          </p>
          <span className="text-[10px] text-muted-foreground mt-0.5 block">
            {netBalance >= 0 ? 'رصيد دائن لصالح المول' : 'رصيد مدين مستحق للجهة'}
          </span>
        </Card>

        <Card className="p-4 border-border bg-card">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">قيود اليومية</span>
            <BookOpen className="h-4 w-4 text-primary" />
          </div>
          <p className="text-lg font-bold text-foreground font-mono">
            {journalEntries.length} قيد
          </p>
          <span className="text-[10px] text-muted-foreground mt-0.5 block">
            حسابات مزدوجة مرحلة
          </span>
        </Card>
      </div>

      {/* 2. Main Ledger Tabs & Toolbar */}
      <Card className="border-border shadow-xs overflow-hidden">
        <div className="border-b border-border bg-canvas-sunken/40 px-4 py-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Tabs Header */}
            <div className="flex items-center gap-1.5 bg-card p-1 rounded-lg border border-border w-fit">
              <button
                type="button"
                onClick={() => setActiveTab('transactions')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all',
                  activeTab === 'transactions'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Receipt className="h-3.5 w-3.5" />
                <span>سندات القبض والصرف والدفعات</span>
                <span className={cn(
                  'px-1.5 py-0.2 rounded-full text-[10px] font-mono',
                  activeTab === 'transactions' ? 'bg-primary-foreground/20' : 'bg-muted'
                )}>
                  {transactions.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('journals')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all',
                  activeTab === 'journals'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <BookOpen className="h-3.5 w-3.5" />
                <span>قيود اليومية المحاسبية</span>
                <span className={cn(
                  'px-1.5 py-0.2 rounded-full text-[10px] font-mono',
                  activeTab === 'journals' ? 'bg-primary-foreground/20' : 'bg-muted'
                )}>
                  {journalEntries.length}
                </span>
              </button>
            </div>

            {/* Quick Actions & Search */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="بحث في الحركات والبيان…"
                  className="ps-8 text-xs h-8 w-44 sm:w-56 bg-card"
                />
              </div>

              {can('expense.create') && isPayable && (
                <Button
                  size="sm"
                  onClick={() =>
                    openTx({
                      kind: 'EXPENSE',
                      contactId: contact.id,
                      contactKind: contact.kind,
                    })
                  }
                  className="gap-1 text-xs h-8 bg-danger hover:bg-danger/90 text-white font-semibold shadow-xs"
                >
                  <Plus className="h-3.5 w-3.5" />
                  سند صرف
                </Button>
              )}

              {can('revenue.create') && !isPayable && (
                <Button
                  size="sm"
                  onClick={() =>
                    openTx({
                      kind: 'REVENUE',
                      contactId: contact.id,
                      contactKind: contact.kind,
                    })
                  }
                  className="gap-1 text-xs h-8 font-semibold shadow-xs"
                >
                  <Plus className="h-3.5 w-3.5" />
                  سند قبض
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Tab 1: Transactions Table */}
        {activeTab === 'transactions' && (
          <div className="p-0">
            {txLoading ? (
              <div className="p-12 text-center text-muted-foreground flex flex-col items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span className="text-xs">جاري تحميل السندات والمعاملات…</span>
              </div>
            ) : filteredTransactions.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                <Receipt className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-xs font-bold text-foreground">لا توجد معاملات مسجلة</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  لم يتم تسجيل أي سند قبض أو صرف لهذه الجهة حتى الآن.
                </p>
              </div>
            ) : (
              <div>
                <div className="hidden sm:block">
                  <TransactionsTable rows={filteredTransactions} loading={false} />
                </div>
                <div className="sm:hidden p-3">
                  <MobileTransactionList rows={filteredTransactions} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Double-Entry Journal Entries */}
        {activeTab === 'journals' && (
          <div className="p-4 space-y-3">
            {jeLoading ? (
              <div className="p-12 text-center text-muted-foreground flex flex-col items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span className="text-xs">جاري تحميل القيود المحاسبية…</span>
              </div>
            ) : filteredJournalEntries.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-xs font-bold text-foreground">لا توجد قيود يومية مسجلة</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  لم يتم إنشاء أي قيد محاسبي مزدوج مرتبط بهذه الجهة.
                </p>
              </div>
            ) : (
              filteredJournalEntries.map((je) => (
                <JournalEntryRowItem key={je.id} entry={je} />
              ))
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
