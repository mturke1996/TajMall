'use client';

import { motion } from 'framer-motion';
import { ArrowDownLeft, ArrowUpRight, Paperclip, MoreHorizontal, Receipt, Loader2 } from 'lucide-react';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { EmptyState } from './empty-state';
import { formatMoney, formatShortDate, cn } from '@/lib/utils';
import type { TransactionWithRelations } from '@/lib/db/types';
import { useDeleteTransaction } from '@/lib/db/queries';
import { toast } from 'sonner';

const METHOD_LABEL: Record<string, string> = {
  CASH: 'نقدي',
  CHEQUE: 'صك',
  TRANSFER: 'حوالة',
  CARD: 'بطاقة',
};

const METHOD_TONE: Record<string, 'success' | 'info' | 'warning' | 'plum'> = {
  CASH: 'success',
  CHEQUE: 'info',
  TRANSFER: 'warning',
  CARD: 'plum',
};

export function TransactionsTable({
  rows,
  loading,
  kindFilter,
  currency = 'LYD',
  emptyHref,
  emptyLabel = 'إضافة أول معاملة',
}: {
  rows?: TransactionWithRelations[];
  loading?: boolean;
  kindFilter?: 'REVENUE' | 'EXPENSE';
  currency?: string;
  emptyHref?: string;
  emptyLabel?: string;
}) {
  const data = rows ?? [];
  const del = useDeleteTransaction();

  async function handleDelete(id: string) {
    if (!confirm('هل تريد حذف هذه المعاملة؟')) return;
    try {
      await del.mutateAsync(id);
      toast.success('تم الحذف');
    } catch (e) {
      toast.error('تعذّر الحذف', {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card py-16 text-[12.5px] text-ink-mute">
        <Loader2 className="h-4 w-4 animate-spin stroke-[1.6]" />
        جارٍ تحميل المعاملات…
      </div>
    );
  }

  if (!data.length) {
    return (
      <EmptyState
        icon={Receipt}
        title={
          kindFilter === 'REVENUE'
            ? 'لا توجد إيرادات بعد'
            : kindFilter === 'EXPENSE'
              ? 'لا توجد مصروفات بعد'
              : 'لا توجد معاملات بعد'
        }
        description="ابدأ بإضافة أول معاملة وستظهر التفاصيل والإجماليات هنا تلقائياً."
        action={emptyHref ? { label: emptyLabel, href: emptyHref } : undefined}
      />
    );
  }

  return (
    <>
      {/* Mobile cards */}
      <ul className="flex flex-col gap-2.5 md:hidden">
        {data.map((r, i) => {
          const positive = r.kind === 'REVENUE';
          const amount = Number(r.amount);
          return (
            <motion.li
              key={r.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.02, 0.3), duration: 0.3 }}
              className="surface press flex flex-col gap-3 p-3.5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={cn(
                      'grid h-9 w-9 shrink-0 place-items-center rounded-md border',
                      positive
                        ? 'border-pastel-greenInk/15 bg-pastel-green text-pastel-greenInk'
                        : 'border-pastel-redInk/15 bg-pastel-red text-pastel-redInk',
                    )}
                  >
                    {positive ? (
                      <ArrowDownLeft className="h-4 w-4 stroke-[1.6]" />
                    ) : (
                      <ArrowUpRight className="h-4 w-4 stroke-[1.6]" />
                    )}
                  </span>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-[14px] font-semibold leading-tight">
                      {r.description ?? '—'}
                    </span>
                    <span className="mt-0.5 truncate text-[11px] text-ink-mute">
                      {r.category?.name_ar ?? '—'} · {r.cashbox?.name_ar ?? '—'}
                    </span>
                  </div>
                </div>
                <span
                  className={cn(
                    'num shrink-0 text-end font-mono text-[14px] font-semibold tabular-nums',
                    positive ? 'text-pastel-greenInk' : 'text-pastel-redInk',
                  )}
                >
                  {positive ? '+' : '−'} {formatMoney(amount, currency)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-border pt-3 text-[11px] text-ink-mute">
                <span className="num font-mono">
                  {formatShortDate(r.tx_date)} · #{r.reference ?? r.number}
                </span>
                <Badge variant={METHOD_TONE[r.method] ?? 'neutral'}>
                  {METHOD_LABEL[r.method] ?? r.method}
                </Badge>
              </div>
            </motion.li>
          );
        })}
      </ul>

      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-xl border border-border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-canvas-sunken hover:bg-canvas-sunken">
              <TableHead className="w-[100px]">التاريخ</TableHead>
              <TableHead className="w-[100px]">رقم القيد</TableHead>
              <TableHead className="w-[180px]">البند</TableHead>
              <TableHead>البيان</TableHead>
              <TableHead className="w-[140px]">الخزينة</TableHead>
              <TableHead className="w-[110px]">نوع السداد</TableHead>
              <TableHead className="w-[150px] text-end">المبلغ</TableHead>
              <TableHead className="w-[48px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((r, i) => {
              const positive = r.kind === 'REVENUE';
              const amount = Number(r.amount);
              return (
                <motion.tr
                  key={r.id}
                  initial={{ opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.012, 0.3), duration: 0.3 }}
                  className="border-b border-border transition-colors duration-150 hover:bg-canvas-sunken/60"
                >
                  <TableCell className="num font-mono text-[11.5px] text-ink-mute">
                    {formatShortDate(r.tx_date)}
                  </TableCell>
                  <TableCell className="num font-mono text-[11.5px]">
                    {r.reference ?? r.number}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px]',
                        positive
                          ? 'border-pastel-greenInk/15 bg-pastel-green text-pastel-greenInk'
                          : 'border-pastel-redInk/15 bg-pastel-red text-pastel-redInk',
                      )}
                    >
                      {positive ? (
                        <ArrowDownLeft className="h-3 w-3 stroke-[1.6]" />
                      ) : (
                        <ArrowUpRight className="h-3 w-3 stroke-[1.6]" />
                      )}
                      {r.category?.name_ar ?? '—'}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-md truncate">
                    {r.description ?? '—'}
                  </TableCell>
                  <TableCell className="text-[12px] text-ink-mute">
                    {r.cashbox?.name_ar ?? '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={METHOD_TONE[r.method] ?? 'neutral'}>
                      {METHOD_LABEL[r.method] ?? r.method}
                    </Badge>
                  </TableCell>
                  <TableCell
                    className={cn(
                      'num text-end font-semibold tabular-nums',
                      positive ? 'text-pastel-greenInk' : 'text-pastel-redInk',
                    )}
                  >
                    {positive ? '+' : '−'} {formatMoney(amount, currency)}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm">
                          <MoreHorizontal className="stroke-[1.6]" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>عرض التفاصيل</DropdownMenuItem>
                        <DropdownMenuItem>تعديل</DropdownMenuItem>
                        <DropdownMenuItem>طباعة PDF</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={(e) => {
                            e.preventDefault();
                            handleDelete(r.id);
                          }}
                          className="text-pastel-redInk focus:text-pastel-redInk"
                        >
                          حذف
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </motion.tr>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
