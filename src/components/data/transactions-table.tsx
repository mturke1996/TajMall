'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowDownLeft, ArrowUpRight, Briefcase, Building2, Receipt, SearchX, Trash2, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable } from './data-table';
import { EmptyState } from './empty-state';
import { formatMoney, formatShortDate, cn } from '@/lib/utils';
import type { TransactionWithRelations } from '@/lib/db/types';
import { useDeleteTransaction } from '@/lib/db/queries';
import { usePermission } from '@/lib/supabase/use-permission';
import { toast } from 'sonner';

export function transactionHighlightDomId(id: string) {
  return `transaction-${id}`;
}

const METHOD_LABEL: Record<string, string> = {
  CASH: 'نقدي',
  CHEQUE: 'صك',
  TRANSFER: 'حوالة',
  CARD: 'بطاقة',
};

function signedAmount(r: TransactionWithRelations) {
  const amount = Number(r.amount) || 0;
  return r.kind === 'EXPENSE' ? -amount : amount;
}

function ContactIcon({ kind }: { kind?: string | null }) {
  if (kind === 'TENANT') return <Building2 className="h-3 w-3 shrink-0" />;
  if (kind === 'EMPLOYEE') return <Briefcase className="h-3 w-3 shrink-0" />;
  return <User className="h-3 w-3 shrink-0" />;
}

function contactLabel(r: TransactionWithRelations) {
  if (!r.contact?.name) return '';
  return r.contact.shop_number ? `${r.contact.name} (محل ${r.contact.shop_number})` : r.contact.name;
}

export function TransactionsTable({
  rows,
  loading,
  kindFilter,
  currency = 'LYD',
  emptyHref,
  emptyLabel = 'إضافة أول معاملة',
  highlightId = null,
  isFiltered = false,
  tableId = 'transactions',
}: {
  rows?: TransactionWithRelations[];
  loading?: boolean;
  kindFilter?: 'REVENUE' | 'EXPENSE';
  currency?: string;
  emptyHref?: string;
  emptyLabel?: string;
  highlightId?: string | null;
  /** The rows are a search/date subset — show "no results" instead of "no data yet". */
  isFiltered?: boolean;
  tableId?: string;
}) {
  const data = rows ?? [];
  const del = useDeleteTransaction();
  const { can } = usePermission();
  const canDelete = (r: TransactionWithRelations) =>
    r.kind === 'REVENUE' ? can('revenue.delete') : can('expense.delete');
  const [pendingDelete, setPendingDelete] = useState<TransactionWithRelations | null>(null);

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      await del.mutateAsync(pendingDelete.id);
      toast.success(`حُذفت المعاملة #${pendingDelete.number} وعُكس قيدها`);
    } catch (e) {
      toast.error('تعذّر الحذف', { description: e instanceof Error ? e.message : undefined });
      throw e;
    }
  }

  const columns = useMemo<ColumnDef<TransactionWithRelations, any>[]>(
    () => [
      {
        id: 'number',
        accessorFn: (r) => Number(r.number),
        header: 'رقم',
        meta: { numeric: true, label: 'رقم المعاملة' },
        cell: ({ row }) => (
          <span className="font-mono text-[12px] text-muted-foreground" dir="ltr">
            #{row.original.number}
          </span>
        ),
      },
      {
        id: 'tx_date',
        accessorKey: 'tx_date',
        header: 'التاريخ',
        meta: { alwaysVisible: true },
        cell: ({ row }) => (
          <span className="whitespace-nowrap tabular-nums text-muted-foreground" dir="ltr">
            {formatShortDate(row.original.tx_date)}
          </span>
        ),
        footer: ({ table }) => (
          <span className="text-muted-foreground">
            الإجمالي · {table.getSortedRowModel().rows.length.toLocaleString('en-US')} معاملة
          </span>
        ),
      },
      {
        id: 'category',
        accessorFn: (r) => r.category?.name_ar ?? '',
        header: 'البند',
        cell: ({ row }) =>
          row.original.category?.name_ar ? (
            <Badge variant="neutral">{row.original.category.name_ar}</Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'description',
        accessorFn: (r) => r.description ?? '',
        header: 'البيان',
        enableSorting: false,
        meta: { cellClassName: 'max-w-[18rem]' },
        cell: ({ row }) => (
          <span className="block truncate" title={row.original.description ?? undefined}>
            {row.original.description || <span className="text-muted-foreground">بدون بيان</span>}
          </span>
        ),
      },
      {
        id: 'contact',
        accessorFn: contactLabel,
        header: 'الجهة',
        cell: ({ row }) =>
          row.original.contact?.id ? (
            <Link
              href={`/contacts/${row.original.contact.id}`}
              className="inline-flex max-w-56 items-center gap-1 text-foreground/80 underline-offset-4 hover:text-foreground hover:underline"
            >
              <ContactIcon kind={row.original.contact.kind} />
              <span className="truncate">{contactLabel(row.original)}</span>
            </Link>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'cashbox',
        accessorFn: (r) => r.cashbox?.name_ar ?? '',
        header: 'الخزينة',
        cell: ({ getValue }) => <span className="whitespace-nowrap text-muted-foreground">{getValue() || '—'}</span>,
      },
      {
        id: 'method',
        accessorFn: (r) => METHOD_LABEL[r.method] ?? r.method,
        header: 'الطريقة',
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-[12.5px] text-ink-soft">
            {METHOD_LABEL[row.original.method] ?? row.original.method}
          </span>
        ),
      },
      {
        id: 'creator',
        accessorFn: (r) => r.creator?.full_name_ar ?? r.creator?.full_name ?? '',
        header: 'المُدخِل',
        meta: { label: 'من أدخلها' },
        cell: ({ getValue }) => <span className="whitespace-nowrap text-muted-foreground">{getValue() || '—'}</span>,
      },
      {
        id: 'amount',
        accessorFn: signedAmount,
        header: 'المبلغ',
        meta: { numeric: true, alwaysVisible: true },
        cell: ({ row }) => {
          const positive = row.original.kind === 'REVENUE';
          return (
            <span
              className={cn('font-mono font-semibold', positive ? 'text-pastel-greenInk' : 'text-pastel-redInk')}
              dir="ltr"
            >
              {formatMoney(positive ? Number(row.original.amount) : -Number(row.original.amount), currency, { signed: true })}
            </span>
          );
        },
        footer: ({ table }) => {
          const total = table.getSortedRowModel().rows.reduce((s, r) => s + signedAmount(r.original), 0);
          const label = kindFilter ? '' : 'صافي ';
          return (
            <span
              className={cn('font-mono', total >= 0 ? 'text-pastel-greenInk' : 'text-pastel-redInk')}
              dir="ltr"
            >
              {label && <span className="font-sans text-muted-foreground">{label}</span>}
              {formatMoney(kindFilter ? Math.abs(total) : total, currency, { signed: !kindFilter })}
            </span>
          );
        },
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">إجراءات</span>,
        enableSorting: false,
        meta: { alwaysVisible: true, align: 'end' },
        cell: ({ row }) =>
          canDelete(row.original) ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setPendingDelete(row.original)}
              aria-label={`حذف المعاملة #${row.original.number}`}
              title="حذف"
            >
              <Trash2 />
            </Button>
          ) : null,
      },
    ],
    // canDelete depends on permissions that load once per session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currency, kindFilter, can],
  );

  const emptyTitle =
    kindFilter === 'REVENUE' ? 'لا توجد إيرادات بعد' : kindFilter === 'EXPENSE' ? 'لا توجد مصروفات بعد' : 'لا توجد معاملات بعد';

  return (
    <>
      <DataTable
        tableId={tableId}
        caption={kindFilter === 'REVENUE' ? 'الإيرادات' : kindFilter === 'EXPENSE' ? 'المصروفات' : 'المعاملات'}
        data={data}
        columns={columns}
        getRowId={(r) => r.id}
        loading={loading}
        isFiltered={isFiltered}
        initialSorting={[{ id: 'tx_date', desc: true }]}
        highlightId={highlightId}
        rowDomId={(r) => transactionHighlightDomId(r.id)}
        empty={
          <EmptyState
            icon={Receipt}
            title={emptyTitle}
            description="ابدأ بإضافة أول معاملة"
            action={emptyHref ? { label: emptyLabel, href: emptyHref } : undefined}
          />
        }
        noResults={
          <EmptyState
            icon={SearchX}
            title="لا توجد نتائج مطابقة"
            description="جرّب كلمة بحث أخرى أو فترة زمنية أوسع."
          />
        }
        renderMobileRow={(r) => (
          <TransactionCard
            row={r}
            currency={currency}
            onDelete={canDelete(r) ? () => setPendingDelete(r) : undefined}
          />
        )}
      />
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="حذف المعاملة"
        description="سيُعكس قيدها المحاسبي ويعود رصيد الخزينة كما كان. إن كانت دفعة إيجار تعود أشهرها غير مسددة."
        details={
          pendingDelete
            ? [
                { label: 'رقم', value: <span dir="ltr">#{pendingDelete.number}</span> },
                { label: 'التاريخ', value: <span dir="ltr">{formatShortDate(pendingDelete.tx_date)}</span> },
                { label: 'البيان', value: pendingDelete.description || '—' },
                {
                  label: 'المبلغ',
                  value: <span dir="ltr" className="font-mono">{formatMoney(Number(pendingDelete.amount), currency)}</span>,
                },
              ]
            : undefined
        }
        confirmLabel="احذف المعاملة"
        onConfirm={confirmDelete}
      />
    </>
  );
}

function TransactionCard({
  row: r,
  currency,
  onDelete,
}: {
  row: TransactionWithRelations;
  currency: string;
  onDelete?: () => void;
}) {
  const positive = r.kind === 'REVENUE';
  const creatorName = r.creator?.full_name_ar ?? r.creator?.full_name ?? '—';
  return (
    <div className="surface flex min-w-0 max-w-full flex-col gap-2 overflow-hidden p-3">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span
            className={cn(
              'grid h-8 w-8 shrink-0 place-items-center rounded-md',
              positive ? 'bg-pastel-green text-pastel-greenInk' : 'bg-pastel-red text-pastel-redInk',
            )}
            aria-hidden
          >
            {positive ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{r.description || 'بدون بيان'}</p>
            <p className="truncate text-xs text-muted-foreground">
              {r.category?.name_ar}
              {r.cashbox?.name_ar ? ` · ${r.cashbox.name_ar}` : ''}
            </p>
            {r.contact?.id && (
              <Link
                href={`/contacts/${r.contact.id}`}
                className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-foreground/80 underline-offset-4 hover:underline"
              >
                <ContactIcon kind={r.contact.kind} />
                <span className="truncate">{contactLabel(r)}</span>
              </Link>
            )}
          </div>
        </div>
        <span
          className={cn(
            'max-w-[42%] shrink-0 text-end font-mono text-sm font-semibold leading-tight',
            positive ? 'text-pastel-greenInk' : 'text-pastel-redInk',
          )}
          dir="ltr"
        >
          {formatMoney(positive ? Number(r.amount) : -Number(r.amount), currency, { signed: true })}
        </span>
      </div>
      <div className="flex min-w-0 items-center justify-between gap-2 border-t border-border/50 pt-2 text-xs text-muted-foreground">
        <span className="tabular-nums" dir="ltr">
          #{r.number} · {formatShortDate(r.tx_date)}
        </span>
        <span className="min-w-0 truncate">{creatorName}</span>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="flex shrink-0 items-center gap-1 text-pastel-redInk underline-offset-4 hover:underline"
          >
            <Trash2 className="h-3 w-3" /> حذف
          </button>
        )}
      </div>
    </div>
  );
}
