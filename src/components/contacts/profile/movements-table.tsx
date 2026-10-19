'use client';

import { useCallback, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { CopyPlus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable } from '@/components/data/data-table';
import { MovementAmount, MovementCard, MOVEMENT_STATUS } from '@/components/contacts/profile/movement-row';
import { CHIP } from '@/components/people';
import { useReturnFocus } from '@/components/contacts/profile/use-return-focus';
import { useRepeatTransaction } from '@/components/transactions/use-repeat-transaction';
import { isCountedTransaction } from '@/lib/contacts/contact-transactions';
import { useDeleteTransaction } from '@/lib/db/queries';
import type { TransactionWithRelations } from '@/lib/db/types';
import { usePermission } from '@/lib/supabase/use-permission';
import { friendlyError } from '@/lib/user-messages';
import { arabicCount, cn, formatMoney, formatShortDate } from '@/lib/utils';

const METHOD_LABEL: Record<string, string> = { CASH: 'نقدي', CHEQUE: 'صك', TRANSFER: 'حوالة', CARD: 'بطاقة' };

const signed = (t: TransactionWithRelations) => (t.kind === 'EXPENSE' ? -1 : 1) * (Number(t.amount) || 0);

/**
 * The contact's transactions: a table on a desktop, a card per row on a phone or tablet. The columns of the
 * general transactions table, minus the contact itself (every row is theirs). Sorting, column choice, repeat
 * and delete work as there. The net in the footer counts only posted and reconciled rows.
 */
export function MovementsTable({ rows, isFiltered }: { rows: TransactionWithRelations[]; isFiltered: boolean }) {
  const { can } = usePermission();
  const { repeat } = useRepeatTransaction();
  const del = useDeleteTransaction();
  const [pendingDelete, setPendingDelete] = useState<TransactionWithRelations | null>(null);
  useReturnFocus(pendingDelete !== null);

  // plain booleans: `can` is a new function on every render, and columns built from it would be new on every
  // render too, which makes the table rebuild its cells (focus on a row button is lost, rows flash)
  const mayDeleteIn = can('revenue.delete');
  const mayDeleteOut = can('expense.delete');
  const mayRepeatIn = can('revenue.create');
  const mayRepeatOut = can('expense.create');
  const canDelete = useCallback((t: TransactionWithRelations) => (t.kind === 'REVENUE' ? mayDeleteIn : mayDeleteOut), [mayDeleteIn, mayDeleteOut]);
  const canRepeat = useCallback(
    (t: TransactionWithRelations) => (t.kind === 'REVENUE' ? mayRepeatIn : t.kind === 'EXPENSE' ? mayRepeatOut : false),
    [mayRepeatIn, mayRepeatOut],
  );

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      await del.mutateAsync(pendingDelete.id);
      toast.success(`حُذفت المعاملة #${pendingDelete.number} وعُكس قيدها`);
    } catch (e) {
      toast.error(friendlyError(e, 'تعذّر الحذف'));
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
          <span className="text-[12px] text-ink-mute tabular-nums" dir="ltr">
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
          <span className="whitespace-nowrap tabular-nums text-ink-soft" dir="ltr">
            {formatShortDate(row.original.tx_date)}
          </span>
        ),
        footer: ({ table }) => (
          <span className="text-ink-mute">
            الإجمالي · {arabicCount(table.getSortedRowModel().rows.length, ['معاملة واحدة', 'معاملتان', 'معاملات', 'معاملة'])}
          </span>
        ),
      },
      {
        id: 'description',
        accessorFn: (r) => `${r.description ?? ''} ${r.category?.name_ar ?? ''}`,
        header: 'البيان',
        enableSorting: false,
        meta: { alwaysVisible: true, cellClassName: 'max-w-[22rem]' },
        cell: ({ row }) => {
          const t = row.original;
          const status = MOVEMENT_STATUS[t.status];
          return (
            <div className="min-w-0">
              <p className={cn('truncate text-foreground', t.status === 'VOIDED' && 'line-through decoration-ink-mute')} title={t.description ?? undefined}>
                {t.description?.trim() || <span className="text-ink-mute">بدون بيان</span>}
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-1.5">
                {t.category?.name_ar && <Badge variant="neutral">{t.category.name_ar}</Badge>}
                {status && <span className={cn('rounded-full border px-1.5 text-[11px] leading-5', CHIP[status.tone])}>{status.label}</span>}
              </p>
            </div>
          );
        },
      },
      {
        id: 'cashbox',
        accessorFn: (r) => r.cashbox?.name_ar ?? '',
        header: 'الخزينة',
        cell: ({ getValue }) => <span className="whitespace-nowrap text-ink-soft">{getValue() || '—'}</span>,
      },
      {
        id: 'method',
        accessorFn: (r) => METHOD_LABEL[r.method] ?? r.method,
        header: 'الطريقة',
        cell: ({ getValue }) => <span className="whitespace-nowrap text-[12.5px] text-ink-soft">{getValue()}</span>,
      },
      {
        id: 'creator',
        accessorFn: (r) => r.creator?.full_name_ar ?? r.creator?.full_name ?? '',
        header: 'المُدخِل',
        meta: { label: 'من أدخلها' },
        cell: ({ getValue }) => <span className="whitespace-nowrap text-ink-soft">{getValue() || '—'}</span>,
      },
      {
        id: 'amount',
        accessorFn: signed,
        header: 'المبلغ',
        meta: { numeric: true, alwaysVisible: true },
        cell: ({ row }) => <MovementAmount tx={row.original} />,
        footer: ({ table }) => {
          const net = table
            .getSortedRowModel()
            .rows.filter((r) => isCountedTransaction(r.original))
            .reduce((s, r) => s + signed(r.original), 0);
          return (
            <span className={cn('whitespace-nowrap font-semibold tabular-nums', net >= 0 ? 'text-success-ink' : 'text-danger-ink')}>
              <span className="font-normal text-ink-mute">الصافي </span>
              {formatMoney(net, 'LYD', { signed: true })}
            </span>
          );
        },
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">إجراءات</span>,
        enableSorting: false,
        meta: { alwaysVisible: true, align: 'end' },
        cell: ({ row }) => {
          const again = canRepeat(row.original);
          const remove = canDelete(row.original);
          if (!again && !remove) return null;
          return (
            <div className="flex items-center justify-end gap-0.5">
              {again && (
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => repeat(row.original)} aria-label={`كرّر المعاملة #${row.original.number}`} title="كرّر المعاملة">
                  <CopyPlus />
                </Button>
              )}
              {remove && (
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => setPendingDelete(row.original)} aria-label={`حذف المعاملة #${row.original.number}`} title="حذف">
                  <Trash2 />
                </Button>
              )}
            </div>
          );
        },
      },
    ],
    [canDelete, canRepeat, repeat],
  );

  return (
    <>
      <DataTable
        tableId="contact-movements"
        caption="حركات الجهة"
        data={rows}
        columns={columns}
        getRowId={(r) => r.id}
        isFiltered={isFiltered}
        initialSorting={[{ id: 'tx_date', desc: true }]}
        initiallyHidden={['creator', 'number']}
        rowClassName={(r) => (isCountedTransaction(r) ? undefined : 'text-ink-mute')}
        renderMobileRow={(r) => (
          <MovementCard
            tx={r}
            onRepeat={canRepeat(r) ? repeat : undefined}
            onDelete={canDelete(r) ? setPendingDelete : undefined}
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
                { label: 'المبلغ', value: <span className="tabular-nums">{formatMoney(Number(pendingDelete.amount), pendingDelete.currency || 'LYD')}</span> },
              ]
            : undefined
        }
        confirmLabel="احذف المعاملة"
        onConfirm={confirmDelete}
      />
    </>
  );
}
