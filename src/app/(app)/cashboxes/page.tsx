'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Plus, Wallet, Landmark, Loader2, Pencil, ArrowLeftRight, ChevronLeft, BookOpen } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/data/empty-state';
import { useCashboxBalances, useCashboxes } from '@/lib/db/queries';
import { formatMoney, cn } from '@/lib/utils';
import { CashboxFormDialog } from '@/components/cashboxes/cashbox-form-dialog';
import { CashboxTransferDialog } from '@/components/cashboxes/cashbox-transfer-dialog';
import { CashboxTransfersHistory } from '@/components/cashboxes/cashbox-transfers-history';
import { usePermission } from '@/lib/supabase/use-permission';
import type { CashboxRow } from '@/lib/db/types';
import { useHighlightScroll, isHighlighted } from '@/lib/hooks/use-highlight-scroll';

function cashboxHighlightDomId(id: string) {
  return `cashbox-${id}`;
}

export default function CashboxesPage() {
  const highlightId = useSearchParams().get('highlight');
  const [open, setOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [editRow, setEditRow] = useState<CashboxRow | null>(null);
  const { can } = usePermission();
  const canManage = can('cashbox.manage');

  const { data, isLoading } = useCashboxBalances();
  const { data: cashboxes = [] } = useCashboxes();
  const items = data ?? [];

  useHighlightScroll(highlightId, cashboxHighlightDomId, [items.length]);

  const cashboxById = useMemo(
    () => new Map(cashboxes.map((c) => [c.id, c])),
    [cashboxes],
  );

  const openCreate = () => {
    setEditRow(null);
    setOpen(true);
  };

  const openEdit = (id: string) => {
    const row = cashboxById.get(id);
    if (!row) return;
    setEditRow(row);
    setOpen(true);
  };

  const handleDialogChange = (next: boolean) => {
    setOpen(next);
    if (!next) setEditRow(null);
  };

  return (
    <>
      <PageHeader
        eyebrow="الخزائن والمصارف"
        title="إدارة الخزائن"
        description="تابع أرصدة الخزائن والحسابات المصرفية، حوّل بينها، واعرض سجل حركات كل خزينة."
        actions={
          canManage ? (
            <div className="flex w-full flex-wrap gap-2 sm:w-auto">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 touch-manipulation"
                onClick={() => setTransferOpen(true)}
                disabled={items.length < 2}
              >
                <ArrowLeftRight className="stroke-[1.6]" />
                تحويل بين الخزائن
              </Button>
              <Button size="sm" className="gap-1.5 touch-manipulation" onClick={openCreate}>
                <Plus className="stroke-[1.6]" />
                خزينة جديدة
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-6 px-4 py-5 sm:px-5 sm:py-7 md:px-8 md:py-10">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card py-12 text-[12.5px] text-ink-mute">
            <Loader2 className="h-4 w-4 animate-spin stroke-[1.6]" />
            جارٍ التحميل…
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="لا توجد خزائن أو حسابات بعد"
            description="ابدأ بإنشاء الخزينة النقدية الرئيسية ثم أضف حسابات المصارف."
            action={
              canManage
                ? { label: 'خزينة جديدة', onClick: openCreate }
                : undefined
            }
          />
        ) : (
          <>
            <p className="flex items-center gap-1.5 text-[12px] text-ink-mute">
              <BookOpen className="h-3.5 w-3.5" />
              اضغط أي خزينة لعرض السجل الكامل والحركات
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((c, i) => {
                const full = cashboxById.get(c.id);
                const Icon = c.kind === 'CASH' ? Wallet : Landmark;
                const balance = Number(c.balance);
                const inflow = Number(c.month_inflow);
                const outflow = Number(c.month_outflow);
                const net = inflow - outflow;
                return (
                  <motion.div
                    key={c.id}
                    id={cashboxHighlightDomId(c.id)}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04, duration: 0.4 }}
                    className={cn(
                      'scroll-mt-24',
                      isHighlighted(highlightId, c.id) && 'rounded-xl ring-2 ring-sage-600 shadow-md',
                    )}
                  >
                    <Link
                      href={`/cashboxes/${c.id}`}
                      className="surface group flex flex-col gap-5 p-5 transition-opacity hover:opacity-95"
                    >
                      <header className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className="grid h-10 w-10 shrink-0 place-items-center rounded-md border"
                            style={{
                              background: `${c.color ?? '#6E7470'}1f`,
                              borderColor: `${c.color ?? '#6E7470'}55`,
                            }}
                          >
                            <Icon
                              className="h-[16px] w-[16px] stroke-[1.5]"
                              style={{ color: c.color ?? undefined }}
                            />
                          </span>
                          <div className="flex min-w-0 flex-col">
                            <h3 className="text-[15px] font-semibold tracking-tight truncate">
                              {c.name_ar}
                            </h3>
                            <span className="text-[11px] text-ink-mute">
                              {c.kind === 'CASH'
                                ? 'خزينة نقدية'
                                : `حساب مصرفي${c.bank_name ? ` · ${c.bank_name}` : ''}`}
                            </span>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {canManage && full && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              className="h-8 w-8 touch-manipulation"
                              aria-label={`تعديل ${c.name_ar}`}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                openEdit(c.id);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Badge variant="neutral" className="font-mono normal-case tracking-normal">
                            {c.code}
                          </Badge>
                        </div>
                      </header>

                      {(full?.account_number || full?.iban) && (
                        <div className="rounded-md border border-border bg-secondary/40 px-3 py-2 text-[11px] space-y-1 font-mono">
                          {full.account_number && (
                            <p className="text-ink-mute">
                              <span className="font-sans font-medium text-foreground">حساب: </span>
                              <span dir="ltr" className="inline-block">{full.account_number}</span>
                            </p>
                          )}
                          {full.iban && (
                            <p className="text-ink-mute break-all">
                              <span className="font-sans font-medium text-foreground">IBAN: </span>
                              <span dir="ltr">{full.iban}</span>
                            </p>
                          )}
                        </div>
                      )}

                      <div className="flex flex-col gap-1.5 border-y border-border py-4">
                        <span className="text-[10px] uppercase tracking-[0.18em] text-ink-mute">
                          الرصيد الحالي
                        </span>
                        <span className="num text-[26px] font-semibold tracking-tight">
                          {formatMoney(balance, c.currency || 'LYD')}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-[12px]">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] uppercase tracking-[0.18em] text-ink-mute">
                            وارد الشهر
                          </span>
                          <span className="num font-semibold text-pastel-greenInk tabular-nums">
                            + {formatMoney(inflow, c.currency || 'LYD', { compact: true })}
                          </span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] uppercase tracking-[0.18em] text-ink-mute">
                            صادر الشهر
                          </span>
                          <span className="num font-semibold text-pastel-redInk tabular-nums">
                            − {formatMoney(outflow, c.currency || 'LYD', { compact: true })}
                          </span>
                        </div>
                      </div>

                      <footer className="flex items-center justify-between border-t border-border pt-3 text-[11px]">
                        <span className="flex items-center gap-1 font-semibold text-sage-700 group-hover:underline">
                          <ChevronLeft className="h-3 w-3" />
                          سجل الحركات
                        </span>
                        <span
                          className={cn(
                            'num font-semibold tabular-nums text-ink-mute',
                            net >= 0 ? 'text-pastel-greenInk' : 'text-pastel-redInk',
                          )}
                        >
                          صافي الشهر {net >= 0 ? '+' : '−'}{' '}
                          {formatMoney(Math.abs(net), c.currency || 'LYD', { compact: true })}
                        </span>
                      </footer>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          </>
        )}

        {items.length >= 2 ? <CashboxTransfersHistory /> : null}
      </div>

      <CashboxFormDialog open={open} onOpenChange={handleDialogChange} editRow={editRow} />
      <CashboxTransferDialog open={transferOpen} onOpenChange={setTransferOpen} />
    </>
  );
}
