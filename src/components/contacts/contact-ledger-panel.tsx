'use client';

import { useState, useMemo } from 'react';
import {
  Receipt,
  BookOpen,
  Plus,
  Search,
  Loader2,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { matchesSearch } from '@/lib/arabic-search';

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
    <div className="rounded-xl border border-border bg-card overflow-hidden transition-all">
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
                  'text-[11px] px-1.5 py-0.2 gap-1',
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
                <Badge className="bg-success-soft text-success-ink text-[11px]">
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

  // Totals count money that actually moved; drafts and voided transactions stay listed but are not added.
  const counted = useMemo(
    () => transactions.filter((t) => t.status === 'POSTED' || t.status === 'RECONCILED'),
    [transactions]
  );
  const excludedCount = transactions.length - counted.length;
  const revenueTxs = useMemo(() => counted.filter((t) => t.kind === 'REVENUE'), [counted]);
  const expenseTxs = useMemo(() => counted.filter((t) => t.kind === 'EXPENSE'), [counted]);
  const totalInflow = useMemo(() => revenueTxs.reduce((s, t) => s + Number(t.amount || 0), 0), [revenueTxs]);
  const totalOutflow = useMemo(() => expenseTxs.reduce((s, t) => s + Number(t.amount || 0), 0), [expenseTxs]);
  const net = totalInflow - totalOutflow;

  const filteredTransactions = useMemo(
    () =>
      transactions.filter((t) =>
        matchesSearch(searchQuery, [t.description, t.category?.name_ar, t.cashbox?.name_ar, t.number, t.amount, t.reference])
      ),
    [transactions, searchQuery]
  );

  const filteredJournalEntries = useMemo(
    () => journalEntries.filter((je) => matchesSearch(searchQuery, [je.description, je.number, je.total_debit])),
    [journalEntries, searchQuery]
  );

  const isPayable =
    role === 'LANDLORD' ||
    role === 'SUPPLIER_ELECTRICITY' ||
    role === 'SUPPLIER_WATER' ||
    role === 'SUPPLIER_GOODS' ||
    role === 'SERVICE_PROVIDER' ||
    role === 'EMPLOYEE';
  const txKind = isPayable ? 'EXPENSE' : 'REVENUE';
  const mayCreate = contact.is_active && can(isPayable ? 'expense.create' : 'revenue.create');

  const tabs = [
    { id: 'transactions' as const, label: 'المعاملات', count: transactions.length, icon: Receipt },
    { id: 'journals' as const, label: 'القيود', count: journalEntries.length, icon: BookOpen },
  ];

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3">
          <div className="bg-card p-4">
            <p className="flex items-center gap-1.5 text-[12.5px] text-ink-mute">
              <ArrowDownLeft className="h-3.5 w-3.5 text-success-ink" aria-hidden />
              المقبوض منها
            </p>
            <p className="mt-0.5 text-[18px] font-semibold tabular-nums text-foreground">{formatMoney(totalInflow, 'LYD')}</p>
            <p className="text-[12px] text-ink-mute">{revenueTxs.length} سند قبض</p>
          </div>
          <div className="bg-card p-4">
            <p className="flex items-center gap-1.5 text-[12.5px] text-ink-mute">
              <ArrowUpRight className="h-3.5 w-3.5 text-danger-ink" aria-hidden />
              المدفوع لها
            </p>
            <p className="mt-0.5 text-[18px] font-semibold tabular-nums text-foreground">{formatMoney(totalOutflow, 'LYD')}</p>
            <p className="text-[12px] text-ink-mute">{expenseTxs.length} سند صرف</p>
          </div>
          <div className="col-span-2 bg-card p-4 sm:col-span-1">
            <p className="text-[12.5px] text-ink-mute">صافي الحركة النقدية</p>
            <p className="mt-0.5 text-[18px] font-semibold tabular-nums text-foreground">
              {formatMoney(net, 'LYD', { signed: true })}
            </p>
            <p className="text-[12px] text-ink-mute">المقبوض ناقص المدفوع</p>
          </div>
        </div>
        {excludedCount > 0 && (
          <p className="border-t border-border px-4 py-2 text-[12px] text-ink-mute">
            لا تشمل الإجماليات {excludedCount} {excludedCount === 1 ? 'معاملة' : 'معاملات'} مسودة أو ملغاة (تظهر في القائمة).
          </p>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-border bg-canvas-sunken/40 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <div className="flex w-fit items-center gap-1 rounded-lg border border-border bg-card p-1" role="tablist" aria-label="سجل الجهة">
            {tabs.map((tab) => {
              const TabIcon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors',
                    active ? 'bg-foreground text-background' : 'text-ink-mute hover:text-foreground'
                  )}
                >
                  <TabIcon className="h-3.5 w-3.5" aria-hidden />
                  {tab.label}
                  <span className="tabular-nums opacity-75">{tab.count}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1 sm:flex-none">
              <Search className="pointer-events-none absolute inset-s-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-mute" aria-hidden />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="بحث في البيان أو الرقم…"
                aria-label="بحث في سجل الجهة"
                className="h-9 w-full ps-8 text-[13px] sm:w-56"
              />
            </div>
            {mayCreate && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => openTx({ kind: txKind, contactId: contact.id, contactKind: contact.kind })}
                className="h-9 shrink-0 gap-1 bg-card text-[13px]"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                {isPayable ? 'سند صرف' : 'سند قبض'}
              </Button>
            )}
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
