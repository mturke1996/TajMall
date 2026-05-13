'use client';

import { ArrowDownLeft, ArrowUpRight, Receipt, Loader2, Trash2, User, Building2, Briefcase } from 'lucide-react';
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
        جارٍ التحميل...
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
        description="ابدأ بإضافة أول معاملة"
        action={emptyHref ? { label: emptyLabel, href: emptyHref } : undefined}
      />
    );
  }

  return (
    <>
      {/* Mobile cards */}
      <ul className="flex flex-col gap-2 md:hidden">
        {data.map((r) => {
          const positive = r.kind === 'REVENUE';
          const amount = Number(r.amount);
          const creatorName = r.creator?.full_name_ar ?? r.creator?.full_name ?? '—';
          const contactName = r.contact?.name;
          const contactIcon = r.contact?.kind === 'TENANT' ? <Building2 className="h-3 w-3" /> : 
                             r.contact?.kind === 'EMPLOYEE' ? <Briefcase className="h-3 w-3" /> : 
                             <User className="h-3 w-3" />;
          return (
            <li key={r.id} className="surface flex flex-col gap-2 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'grid h-8 w-8 place-items-center rounded',
                    positive ? 'bg-pastel-green text-pastel-greenInk' : 'bg-pastel-red text-pastel-redInk'
                  )}>
                    {positive ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{r.description || 'بدون وصف'}</p>
                    <p className="text-xs text-ink-mute">{r.category?.name_ar}</p>
                    {contactName && (
                      <p className="text-xs text-sage-600 flex items-center gap-1 mt-0.5">
                        {contactIcon}
                        <span className="truncate">{contactName} {r.contact?.shop_number ? `(محل ${r.contact.shop_number})` : ''}</span>
                      </p>
                    )}
                  </div>
                </div>
                <span className={cn(
                  'font-mono font-semibold shrink-0',
                  positive ? 'text-pastel-greenInk' : 'text-pastel-redInk'
                )}>
                  {positive ? '+' : '−'} {formatMoney(amount, currency)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-ink-mute pt-1 border-t border-border/50">
                <div className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  <span>{creatorName}</span>
                </div>
                <button
                  onClick={() => handleDelete(r.id)}
                  className="text-pastel-redInk hover:underline"
                >
                  <Trash2 className="h-3 w-3 inline" /> حذف
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-xl border border-border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-canvas-sunken">
              <TableHead>التاريخ</TableHead>
              <TableHead>البند</TableHead>
              <TableHead>البيان</TableHead>
              <TableHead>العميل/المستأجر</TableHead>
              <TableHead>الخزينة</TableHead>
              <TableHead>الطريقة</TableHead>
              <TableHead>المنشئ</TableHead>
              <TableHead className="text-end">المبلغ</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((r) => {
              const positive = r.kind === 'REVENUE';
              const amount = Number(r.amount);
              const creatorName = r.creator?.full_name_ar ?? r.creator?.full_name ?? '—';
              const contactName = r.contact?.name;
              return (
                <TableRow key={r.id} className="border-b border-border">
                  <TableCell className="text-xs text-ink-mute">{formatShortDate(r.tx_date)}</TableCell>
                  <TableCell>
                    <Badge variant={positive ? 'success' : 'danger'} className="text-xs">
                      {r.category?.name_ar}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-xs truncate">{r.description}</TableCell>
                  <TableCell className="text-xs">
                    {contactName ? (
                      <span className="flex items-center gap-1 text-sage-700">
                        {r.contact?.kind === 'TENANT' ? <Building2 className="h-3 w-3" /> : 
                         r.contact?.kind === 'EMPLOYEE' ? <Briefcase className="h-3 w-3" /> : 
                         <User className="h-3 w-3" />}
                        <span>{contactName} {r.contact?.shop_number ? `(محل ${r.contact.shop_number})` : ''}</span>
                      </span>
                    ) : '—'}
                  </TableCell>
                  <TableCell className="text-sm text-ink-mute">{r.cashbox?.name_ar}</TableCell>
                  <TableCell>
                    <Badge variant={METHOD_TONE[r.method]} className="text-xs">
                      {METHOD_LABEL[r.method]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{creatorName}</TableCell>
                  <TableCell className={cn(
                    'text-end font-mono font-semibold',
                    positive ? 'text-pastel-greenInk' : 'text-pastel-redInk'
                  )}>
                    {positive ? '+' : '−'} {formatMoney(amount, currency)}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onClick={() => handleDelete(r.id)} className="text-pastel-redInk">
                          حذف
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
