'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RentMonthPicker } from '@/components/rent/rent-month-picker';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { RentAllocationPreview } from '@/components/rent/rent-allocation-preview';
import { useRentPaymentPlan } from '@/components/rent/use-rent-payment-plan';
import { useSetTenantRentMonthStatus } from '@/lib/db/rent-queries';
import { useContactTransactions } from '@/lib/db/queries';
import { buildRentCalendarFromCharges } from '@/lib/rent-calendar-from-charges';
import { filterTenantJournalEntries, formatJournalOptionLabel, rentChargesByMonth } from '@/lib/rent-journal-link';
import { describeRentIssue, roundLyd } from '@/lib/rent-allocation';
import {
  currentYear,
  formatMonthLabelAr,
  formatMonthsLabelAr,
  type RentCalendarMonth,
} from '@/lib/rent-months';
import type { TenantChargeWithRelations } from '@/lib/db/types';
import type { JournalEntryRow } from '@/lib/db/journal-queries';
import { cn, formatDate, formatMoney } from '@/lib/utils';
import { toast } from 'sonner';
import { friendlyError } from '@/lib/user-messages';

type Props = {
  tenantId: string;
  tenantName: string;
  monthlyRent: number;
  years: number[];
  charges: TenantChargeWithRelations[];
  journalEntries: JournalEntryRow[];
  journalsLoading?: boolean;
  claimStart?: string | null;
  manualExemptMonths?: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const money = (n: number) => formatMoney(n, 'LYD');

/**
 * Links rent months to a payment that is already posted (a rent receipt of this tenant), or unlinks
 * them. The split is computed like set_tenant_rent_month_status does it (src/lib/rent-allocation.ts):
 * money left on the receipt after the months stays available to link later; a month the money cannot
 * reach, or a month already paid, is refused before saving.
 */
export function SetRentMonthStatusDialog({
  tenantId,
  tenantName,
  monthlyRent,
  years,
  charges,
  journalEntries,
  journalsLoading = false,
  claimStart,
  manualExemptMonths = [],
  open,
  onOpenChange,
}: Props) {
  const setStatus = useSetTenantRentMonthStatus();
  const confirm = useConfirm();
  const defaultYear = years[0] ?? currentYear();
  const [year, setYear] = useState(defaultYear);
  const [selected, setSelected] = useState<string[]>([]);
  const [journalId, setJournalId] = useState<string>('');
  const [amountText, setAmountText] = useState('');

  // A month may only be marked paid against cash actually received from this tenant: a posted
  // rent revenue transaction. Accrual entries, expenses and other tenants' receipts are excluded.
  const { data: tenantTransactions = [], isLoading: tenantTxLoading } = useContactTransactions(tenantId);
  const rentReceiptIds = useMemo(
    () =>
      new Set(
        tenantTransactions
          .filter((t) => t.kind === 'REVENUE' && t.status === 'POSTED' && t.category?.code === 'REV-RNT')
          .map((t) => t.id),
      ),
    [tenantTransactions],
  );
  const journals = useMemo(
    () =>
      filterTenantJournalEntries(journalEntries).filter(
        (je) => je.source_type === 'TRANSACTION' && !!je.source_id && rentReceiptIds.has(je.source_id),
      ),
    [journalEntries, rentReceiptIds],
  );
  const journalsBusy = journalsLoading || tenantTxLoading;

  // Linked so far on each receipt, and which months, from this tenant's charges.
  const linksByJournal = useMemo(() => {
    const map = new Map<string, { linked: number; months: string[] }>();
    for (const [month, c] of rentChargesByMonth(charges, tenantId)) {
      for (const l of c.rent_journal_links ?? []) {
        const entry = map.get(l.journal_entry_id) ?? { linked: 0, months: [] };
        entry.linked += Number(l.amount) || 0;
        if (!entry.months.includes(month)) entry.months.push(month);
        map.set(l.journal_entry_id, entry);
      }
    }
    return map;
  }, [charges, tenantId]);
  const availableOn = useCallback(
    (je: JournalEntryRow) => roundLyd(Math.max((Number(je.total_debit) || 0) - (linksByJournal.get(je.id)?.linked ?? 0), 0)),
    [linksByJournal],
  );
  const journal = journals.find((j) => j.id === journalId) ?? null;
  const available = journal ? availableOn(journal) : 0;
  const amount = amountText.trim() ? Number(amountText.replace(/,/g, '')) || 0 : available;

  const { plan, basis, basisFor, loading: pricingLoading } = useRentPaymentPlan({
    tenantId,
    contactRent: monthlyRent,
    charges,
    months: selected,
    amount,
  });
  // Money left on the receipt is fine here: it stays available for another month.
  const blocking = plan.issues.filter((i) => i.code !== 'overpaid');
  const overAvailable = journal != null && amount > available + 0.0005;

  useEffect(() => {
    if (!open) return;
    setYear(defaultYear);
    setSelected([]);
    setJournalId('');
    setAmountText('');
  }, [open, defaultYear]);

  const calendarMonths: RentCalendarMonth[] = useMemo(
    () =>
      buildRentCalendarFromCharges(tenantId, year, monthlyRent, charges, {
        claimStart,
        manualExemptMonths,
      }).months,
    [tenantId, year, monthlyRent, charges, claimStart, manualExemptMonths],
  );

  const monthHints = useMemo(() => {
    const hints = new Map<string, { disabledReason?: string; progress?: string }>();
    for (const m of calendarMonths) {
      if (m.status === 'exempt') continue;
      const b = basisFor(m.month);
      if (b.paid > 0 && b.remaining > 0) {
        hints.set(m.month, {
          progress: `${formatMoney(b.paid, '')} من ${formatMoney(b.amount, '')}`,
        });
      }
    }
    return hints;
  }, [calendarMonths, basisFor]);

  async function savePaid() {
    if (!journal) {
      toast.error('اختر دفعة الإيجار التي تُربط بها الأشهر');
      return;
    }
    if (blocking.length > 0) {
      toast.error(describeRentIssue(blocking[0], formatMonthLabelAr));
      return;
    }
    if (overAvailable) {
      toast.error(`المتاح غير المربوط على هذه الدفعة ${money(available)} فقط`);
      return;
    }
    try {
      await setStatus.mutateAsync({
        tenantId,
        months: [...selected].sort(),
        paid: true,
        journalEntryId: journal.id,
        amount: roundLyd(plan.lines.reduce((s, l) => s + l.applied, 0)),
      });
      toast.success('رُبطت الأشهر بالدفعة', {
        description: plan.lines
          .map((l) => `${formatMonthLabelAr(l.month)}: ${l.status === 'paid' ? 'مُسدَّد' : `جزئي ${money(l.paidAfter)} من ${money(l.amount)}`}`)
          .join(' · '),
      });
      onOpenChange(false);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err && 'message' in err
            ? String((err as { message: unknown }).message)
            : 'تعذّر الحفظ';
      toast.error(msg);
    }
  }

  async function clearMonth() {
    if (selected.length === 0) return;
    const months = formatMonthsLabelAr([...selected].sort());
    const ok = await confirm({
      title: `إلغاء ربط ${months}؟`,
      description: 'تعود الأشهر غير مسددة في التقويم. الدفعات نفسها تبقى في الخزينة واليومية كما هي، ويمكن ربطها من جديد.',
      confirmLabel: 'ألغِ الربط',
    });
    if (!ok) return;
    try {
      await setStatus.mutateAsync({ tenantId, months: [...selected].sort(), paid: false });
      toast.success(`${formatMonthsLabelAr([...selected].sort())} — أُلغي الربط وعاد غير مسدد`);
      onOpenChange(false);
    } catch (err) {
      toast.error(friendlyError(err, 'تعذّر التحديث'));
    }
  }

  const canSave =
    !setStatus.isPending && !pricingLoading && selected.length > 0 && journal != null && blocking.length === 0 && !overAvailable && amount > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-xl w-[calc(100%-1.5rem)] max-h-[92dvh] overflow-y-auto rounded-2xl p-0 gap-0"
        dir="rtl"
      >
        <DialogHeader className="px-5 pt-5 pb-3 pe-12 border-b border-border text-start">
          <DialogTitle>ربط أشهر بدفعة مسجّلة</DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed">
            {tenantName} — لدفعة إيجار سُجّلت دون أشهر أو بقي منها جزء غير مربوط. لا يُنشئ قيداً جديداً؛ يحدّث
            التقويم والمطالبات فقط.
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 py-4 space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-ink">الأشهر (شهر أو شهران متتاليان)</Label>
              <Select
                value={String(year)}
                onValueChange={(v) => {
                  setYear(Number(v));
                  setSelected([]);
                }}
              >
                <SelectTrigger className="h-9 w-28" aria-label="السنة">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <RentMonthPicker
              year={year}
              selected={selected}
              onChange={setSelected}
              calendarMonths={calendarMonths}
              monthHints={monthHints}
              fullYear
              maxMonths={2}
              showStatus
            />
          </div>

          <div className="space-y-2">
            <Label className="text-ink">دفعة الإيجار</Label>
            {selected.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border bg-canvas-sunken/30 px-3 py-4 text-center text-sm text-ink-mute">
                اختر الشهر أولاً
              </p>
            ) : journalsBusy ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-ink-soft" aria-label="جارٍ التحميل" />
              </div>
            ) : journals.length === 0 ? (
              <p className="rounded-xl border border-border px-3 py-4 text-center text-sm text-ink-mute">
                لا توجد دفعات إيجار مرحّلة لهذا المستأجر. سجّل التحصيل أولاً.
              </p>
            ) : (
              <ul className="max-h-56 overflow-y-auto rounded-xl border border-border divide-y divide-border" role="listbox" aria-label="دفعات الإيجار">
                {journals.map((je) => {
                  const isSelected = journalId === je.id;
                  const free = availableOn(je);
                  const linkedMonths = linksByJournal.get(je.id)?.months ?? [];
                  return (
                    <li key={je.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        disabled={free <= 0}
                        onClick={() => {
                          setJournalId(je.id);
                          setAmountText('');
                        }}
                        className={cn(
                          'w-full px-3 py-2.5 text-start transition-colors touch-manipulation disabled:cursor-not-allowed disabled:opacity-55',
                          isSelected ? 'bg-canvas-sunken ring-1 ring-inset ring-ink-soft' : 'hover:bg-canvas-sunken',
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium">{formatJournalOptionLabel(je)}</span>
                          <span className="shrink-0 text-[12px] tabular-nums text-foreground">{money(Number(je.total_debit))}</span>
                        </div>
                        <p className="mt-0.5 text-[12px] text-ink-mute">
                          {formatDate(je.entry_date)} ·{' '}
                          {free <= 0 ? (
                            'مربوطة بالكامل'
                          ) : (
                            <>
                              متاح للربط <span className="font-semibold tabular-nums text-foreground">{money(free)}</span>
                            </>
                          )}
                          {linkedMonths.length > 0 && <> · مربوطة بـ {formatMonthsLabelAr(linkedMonths.sort())}</>}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {journalId && (
              <Button variant="link" className="h-auto p-0 text-xs" asChild>
                <Link href={`/journals?highlight=${journalId}`}>فتح القيد</Link>
              </Button>
            )}
          </div>

          {journal && selected.length > 0 && (
            <>
              <div>
                <Label htmlFor="link-amount">المبلغ الذي يُربط (د.ل)</Label>
                <Input
                  id="link-amount"
                  type="text"
                  inputMode="decimal"
                  dir="ltr"
                  placeholder={String(available)}
                  value={amountText}
                  onChange={(e) => setAmountText(e.target.value.replace(/[^\d.,]/g, ''))}
                  className="mt-1.5 h-11 tabular-nums text-end"
                />
                <p className="mt-1 text-[12px] text-ink-mute">
                  فارغ = كل المتاح على الدفعة ({money(available)}). أدخل مبلغاً أصغر لربط جزء فقط.
                </p>
                {overAvailable && (
                  <p className="mt-1 text-[12px] text-danger-ink" role="alert">
                    المتاح غير المربوط على هذه الدفعة {money(available)} فقط.
                  </p>
                )}
              </div>
              {!pricingLoading && (
                <RentAllocationPreview
                  plan={{ ...plan, issues: blocking, ok: blocking.length === 0 }}
                  basis={basis}
                  onRemoveMonth={(month, andLater) =>
                    setSelected((prev) => prev.filter((m) => (andLater ? m < month : m !== month)))
                  }
                  onAddNextMonth={() => undefined}
                  onSetAmount={(n) => setAmountText(String(n))}
                />
              )}
              {plan.leftover > 0 && blocking.length === 0 && (
                <p className="text-[12px] text-info-ink">
                  يبقى {money(plan.leftover)} من الدفعة غير مربوط، ويمكن ربطه بشهر آخر لاحقاً.
                </p>
              )}
            </>
          )}
        </div>

        <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-border bg-card px-5 py-3.5 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={setStatus.isPending}>
            إغلاق
          </Button>
          <Button type="button" variant="outline" onClick={clearMonth} disabled={setStatus.isPending || selected.length === 0}>
            إلغاء ربط الأشهر المحددة
          </Button>
          <Button type="button" onClick={savePaid} disabled={!canSave}>
            {setStatus.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : 'حفظ الربط'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
