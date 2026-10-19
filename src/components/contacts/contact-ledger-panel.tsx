'use client';

import { useMemo, useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp, CircleCheck, Clock, Plus, Receipt, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { JournalVoucherTable } from '@/components/accounting/journal-voucher-table';
import { EmptyBlock, ErrorBlock, LoadingBlock, CHIP } from '@/components/people';
import { ProfilePanel, ProfileTabs, type ProfileTabDef } from '@/components/contacts/profile/profile-tabs';
import { ProfileKpis, UncountedNote } from '@/components/contacts/profile/profile-kpis';
import { MovementsTable } from '@/components/contacts/profile/movements-table';
import { mapJournalLineRowToVoucherLine } from '@/lib/journal-entry-display';
import { useJournalLines, type JournalEntryRow } from '@/lib/db/journal-queries';
import { TajMallPdfToolbar } from '@/features/pdf/taj-mall-pdf-toolbar';
import { buildJournalEntriesForPdf } from '@/lib/journal-pdf';
import { useTxDialog } from '@/stores/transaction-dialog';
import { usePermission } from '@/lib/supabase/use-permission';
import { matchesSearch } from '@/lib/arabic-search';
import { buildPartyStats, type Direction } from '@/lib/people/party-stats';
import { DIRECTION_WORDS, profileDirection, txKindOfDirection, uncountedCount } from '@/lib/people/party-profile';
import { friendlyError } from '@/lib/user-messages';
import { cn, formatDate, formatMoney } from '@/lib/utils';
import type { ContactRow, TransactionWithRelations } from '@/lib/db/types';

// ---------------------------------------------------------------- transactions

type Side = 'all' | 'in' | 'out';
const SIDE_LABEL: Record<Side, string> = { all: 'الكل', in: 'مقبوض', out: 'مدفوع' };

/**
 * The contact's transactions: search, the voucher button, and the table (a card per row on a phone). Drafts and
 * voided rows are listed, marked, and kept out of every figure.
 */
export function ContactTransactionsList({
  contact,
  transactions,
  direction,
  loading,
  error,
  onRetry,
}: {
  contact: ContactRow;
  transactions: TransactionWithRelations[];
  /** which voucher the add button opens */
  direction: Direction;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [side, setSide] = useState<Side>('all');
  const openTx = useTxDialog((s) => s.open);
  const { can } = usePermission();

  const hasBoth = useMemo(
    () => transactions.some((t) => t.kind === 'REVENUE') && transactions.some((t) => t.kind === 'EXPENSE'),
    [transactions],
  );
  const rows = useMemo(
    () =>
      transactions.filter(
        (t) =>
          (side === 'all' || !hasBoth || (side === 'in' ? t.kind === 'REVENUE' : t.kind === 'EXPENSE')) &&
          matchesSearch(query, [t.description, t.category?.name_ar, t.cashbox?.name_ar, t.number, t.amount, t.reference]),
      ),
    [transactions, query, side, hasBoth],
  );

  const kind = txKindOfDirection(direction);
  const mayCreate = contact.is_active && can(kind === 'EXPENSE' ? 'expense.create' : 'revenue.create');
  const add = () => openTx({ kind, contactId: contact.id, contactKind: contact.kind });
  const filtered = query.trim() !== '' || (hasBoth && side !== 'all');

  return (
    <Card className="min-w-0 overflow-hidden">
      <div className="flex flex-col gap-2 border-b border-border px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute inset-s-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" aria-hidden />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="بحث في البيان أو الرقم أو المبلغ"
            aria-label="بحث في حركات الجهة"
            className="h-11 ps-9 text-[13.5px] sm:h-9"
          />
        </div>
        <div className="flex items-center gap-2">
          {hasBoth && (
            <div className="flex items-center rounded-lg border border-border bg-canvas-sunken p-0.5" role="group" aria-label="نوع الحركة">
              {(['all', 'in', 'out'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={side === s}
                  onClick={() => setSide(s)}
                  className={cn(
                    'min-h-10 rounded-md px-3 text-[13px] font-medium sm:min-h-8',
                    side === s ? 'bg-card text-foreground shadow-whisper' : 'text-ink-mute hover:text-foreground',
                  )}
                >
                  {SIDE_LABEL[s]}
                </button>
              ))}
            </div>
          )}
          {mayCreate && (
            <Button type="button" variant="outline" className="ms-auto h-11 shrink-0 gap-1.5 px-3.5 sm:h-9" onClick={add}>
              <Plus aria-hidden />
              {DIRECTION_WORDS[direction].voucher}
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <LoadingBlock rows={5} />
      ) : error != null && transactions.length === 0 ? (
        <ErrorBlock message={friendlyError(error, 'تعذّر تحميل حركات الجهة.')} onRetry={onRetry} />
      ) : rows.length === 0 ? (
        <EmptyBlock
          action={
            !filtered && mayCreate ? (
              <Button type="button" variant="outline" className="min-h-11 sm:min-h-9" onClick={add}>
                <Plus aria-hidden />
                {DIRECTION_WORDS[direction].voucher}
              </Button>
            ) : undefined
          }
        >
          {filtered ? 'لا توجد حركات مطابقة.' : 'لا توجد حركات لهذه الجهة بعد.'}
        </EmptyBlock>
      ) : (
        <div className="p-3 sm:p-4">
          <MovementsTable rows={rows} isFiltered={filtered} />
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- journal entries

const JE_STATUS = {
  POSTED: { label: 'مرحّل', tone: 'success' as const, icon: CircleCheck },
  DRAFT: { label: 'مسودة', tone: 'warning' as const, icon: Clock },
  REVERSED: { label: 'معكوس', tone: 'danger' as const, icon: Clock },
};

function JournalEntryItem({ entry }: { entry: JournalEntryRow }) {
  const [open, setOpen] = useState(false);
  // an empty id keeps the query off: closed rows must not each fetch their lines
  const { data: lines = [], isLoading, isError, refetch } = useJournalLines(open ? entry.id : '');
  const voucherLines = useMemo(() => lines.map(mapJournalLineRowToVoucherLine), [lines]);
  const balanced = Number(entry.total_debit || 0) === Number(entry.total_credit || 0);
  const status = JE_STATUS[entry.status as keyof typeof JE_STATUS] ?? JE_STATUS.REVERSED;
  const StatusIcon = status.icon;
  const panelId = `je-${entry.id}`;

  return (
    <li className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg text-start focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-canvas-sunken text-ink-soft" aria-hidden>
            <BookOpen className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-semibold tabular-nums">قيد #{entry.number}</span>
              <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 text-[11.5px] leading-5', CHIP[status.tone])}>
                <StatusIcon className="h-3 w-3" aria-hidden />
                {status.label}
              </span>
              {balanced && entry.status !== 'DRAFT' && <Badge variant="success">متوازن</Badge>}
            </span>
            <span className="mt-0.5 block truncate text-[12px] text-ink-mute">
              {entry.description || 'بدون بيان'} · <span className="tabular-nums">{formatDate(entry.entry_date)}</span>
            </span>
          </span>
        </button>

        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <div className="text-start sm:text-end">
            <span className="block text-[11.5px] text-ink-mute">إجمالي القيد</span>
            <span className="text-[13.5px] font-semibold tabular-nums">{formatMoney(Number(entry.total_debit || 0), 'LYD')}</span>
          </div>
          <TajMallPdfToolbar
            fileName={`قيد-محاسبي-${entry.number}`}
            showDownload={false}
            openLabel="PDF"
            render={async () => {
              const { JournalPDF } = await import('@/features/pdf/JournalPDF');
              const pdfEntries = await buildJournalEntriesForPdf([entry]);
              return <JournalPDF entries={pdfEntries} periodLabel={`القيد المحاسبي رقم ${entry.number}`} />;
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-11 w-11 sm:h-9 sm:w-9"
            aria-label={open ? 'إخفاء أطراف القيد' : 'عرض أطراف القيد'}
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
          </Button>
        </div>
      </div>

      {open && (
        <div id={panelId} className="border-t border-border bg-canvas-sunken/50 p-3 sm:p-4">
          {isLoading ? (
            <LoadingBlock rows={2} className="p-0 sm:p-0" />
          ) : isError ? (
            <ErrorBlock message="تعذّر تحميل أطراف القيد." onRetry={() => void refetch()} className="py-4" />
          ) : voucherLines.length === 0 ? (
            <p className="py-3 text-center text-[12.5px] text-ink-mute">لا بنود مسجّلة لهذا القيد.</p>
          ) : (
            <JournalVoucherTable
              lines={voucherLines}
              totalDebit={entry.total_debit}
              totalCredit={entry.total_credit}
              density="compact"
              className="rounded-lg"
            />
          )}
        </div>
      )}
    </li>
  );
}

/** The contact's journal entries; each opens in place to show its lines. */
export function ContactJournalsList({
  entries,
  loading,
  error,
  onRetry,
}: {
  entries: JournalEntryRow[];
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
}) {
  const [query, setQuery] = useState('');
  const rows = useMemo(() => entries.filter((je) => matchesSearch(query, [je.description, je.number, je.total_debit])), [entries, query]);
  const searching = query.trim() !== '';

  return (
    <Card className="min-w-0 overflow-hidden">
      <div className="border-b border-border px-3 py-3 sm:px-5">
        <div className="relative max-w-xs">
          <Search className="pointer-events-none absolute inset-s-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" aria-hidden />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="بحث في البيان أو رقم القيد"
            aria-label="بحث في قيود الجهة"
            className="h-11 ps-9 text-[13.5px] sm:h-9"
          />
        </div>
      </div>
      {loading ? (
        <LoadingBlock rows={3} />
      ) : error != null && entries.length === 0 ? (
        <ErrorBlock message={friendlyError(error, 'تعذّر تحميل قيود الجهة.')} onRetry={onRetry} />
      ) : rows.length === 0 ? (
        <EmptyBlock>{searching ? 'لا توجد قيود مطابقة.' : 'لا توجد قيود مرتبطة بهذه الجهة.'}</EmptyBlock>
      ) : (
        <ul className="space-y-3 p-3 sm:p-5">
          {rows.map((je) => (
            <JournalEntryItem key={je.id} entry={je} />
          ))}
        </ul>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- the whole ledger

type Props = {
  contact: ContactRow;
  transactions: TransactionWithRelations[];
  journalEntries: JournalEntryRow[];
  txLoading?: boolean;
  jeLoading?: boolean;
  txError?: unknown;
  jeError?: unknown;
  onRetryTx?: () => void;
  onRetryJe?: () => void;
  /** the four figures above the tabs; a page that shows its own turns them off */
  showFigures?: boolean;
};

const LEDGER_TABS = ['transactions', 'journals'] as const;

/**
 * Transactions and journal entries of one contact in two tabs, with the four figures above them. Profiles that
 * need more (charts, details) compose `ContactTransactionsList` and `ContactJournalsList` themselves.
 */
export function ContactLedgerPanel({
  contact,
  transactions,
  journalEntries,
  txLoading = false,
  jeLoading = false,
  txError,
  jeError,
  onRetryTx,
  onRetryJe,
  showFigures = true,
}: Props) {
  const [tab, setTab] = useState<(typeof LEDGER_TABS)[number]>('transactions');
  const stats = useMemo(() => (txLoading || txError ? null : buildPartyStats(transactions)), [transactions, txLoading, txError]);
  const direction = profileDirection(contact, stats);
  const excluded = uncountedCount(transactions);
  const tabs: ProfileTabDef<(typeof LEDGER_TABS)[number]>[] = [
    { id: 'transactions', label: 'الحركات', count: transactions.length, icon: Receipt },
    { id: 'journals', label: 'القيود', count: journalEntries.length, icon: BookOpen },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {showFigures && (
        <>
          <ProfileKpis stats={stats} direction={direction} loading={txLoading} error={!!txError} onRetry={onRetryTx} />
          {!txLoading && !txError && <UncountedNote count={excluded} />}
        </>
      )}
      <ProfileTabs tabs={tabs} value={tab} onValueChange={setTab} label="سجل الجهة">
        <ProfilePanel id="transactions">
          <ContactTransactionsList contact={contact} transactions={transactions} direction={direction} loading={txLoading} error={txError} onRetry={onRetryTx} />
        </ProfilePanel>
        <ProfilePanel id="journals">
          <ContactJournalsList entries={journalEntries} loading={jeLoading} error={jeError} onRetry={onRetryJe} />
        </ProfilePanel>
      </ProfileTabs>
    </div>
  );
}
