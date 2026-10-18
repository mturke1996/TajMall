'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ClipboardList, KeyRound, Loader2, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCashboxBalances } from '@/lib/db/queries';
import {
  useApplyCashboxInventory,
  useCashboxInventoryPinSet,
  useCashboxInventoryRuns,
  useSetCashboxInventoryPin,
} from '@/lib/db/cashbox-inventory-queries';
import { usePermission } from '@/lib/supabase/use-permission';
import { cn, formatMoney, parseAmountInput, todayISODate } from '@/lib/utils';
import { friendlyError } from '@/lib/user-messages';
import { useConfirm } from '@/components/ui/confirm-dialog';

function todayIso() {
  return todayISODate();
}

export default function CashboxCountPage() {
  const { can, loading: roleLoading } = usePermission();
  const canManage = can('cashbox.manage');
  const { data: balanceData, isLoading, refetch: refetchBalances } = useCashboxBalances();
  const balances = useMemo(() => balanceData ?? [], [balanceData]);
  const { data: pinSet, isLoading: pinLoading } = useCashboxInventoryPinSet();
  const { data: runs = [] } = useCashboxInventoryRuns();
  const setPin = useSetCashboxInventoryPin();
  const apply = useApplyCashboxInventory();
  const confirm = useConfirm();

  const [counts, setCounts] = useState<Record<string, string>>({});
  const [pin, setPinValue] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newPin2, setNewPin2] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [notes, setNotes] = useState('');
  const [countDate, setCountDate] = useState(todayIso);

  // The book balance is read fresh when the page opens: a cached figure could be minutes old.
  useEffect(() => {
    void refetchBalances();
  }, [refetchBalances]);

  // Only the boxes the user actually counted: an empty field means "not counted", never "same as the
  // book" — otherwise a payment posted meanwhile would be reversed as a count difference.
  const rows = useMemo(() => {
    return balances.map((row) => {
      const book = Number(row.balance) || 0;
      const raw = counts[row.id] ?? '';
      const counted = raw.trim() === '' ? NaN : parseAmountInput(raw);
      const diff = Number.isFinite(counted) ? counted - book : 0;
      return { row, book, counted, diff, raw, entered: raw.trim() !== '' };
    });
  }, [balances, counts]);

  const entered = rows.filter((r) => r.entered);
  const diffs = entered.filter((r) => Number.isFinite(r.counted) && Math.abs(r.diff) >= 0.0005);
  const net = diffs.reduce((s, r) => s + r.diff, 0);

  function handleSetPin() {
    if (newPin !== newPin2) {
      toast.error('تأكيد الرقم السري غير مطابق');
      return;
    }
    setPin.mutate(
      { newPin, currentPin: pinSet ? currentPin : undefined },
      {
        onSuccess: () => {
          toast.success(pinSet ? 'تم تغيير الرقم السري' : 'تم حفظ الرقم السري');
          setNewPin('');
          setNewPin2('');
          setCurrentPin('');
        },
        onError: (e) => toast.error(friendlyError(e, 'تعذّر حفظ الرقم السري')),
      },
    );
  }

  async function handleApply() {
    if (!pinSet) {
      toast.error('اضبط الرقم السري أولاً');
      return;
    }
    if (entered.length === 0) {
      toast.error('أدخل المبلغ المعدود لخزينة واحدة على الأقل');
      return;
    }
    const invalid = entered.some((r) => !Number.isFinite(r.counted) || r.counted < 0);
    if (invalid) {
      toast.error('أدخل مبلغاً صالحاً (صفر أو أكثر) لكل خزينة عددتها');
      return;
    }
    if (!/^\d{4,8}$/.test(pin)) {
      toast.error('أدخل الرقم السري (4 إلى 8 أرقام)');
      return;
    }
    // compare with the balance as it is now, not as it was when the page loaded
    const fresh = await refetchBalances();
    const freshBook = new Map((fresh.data ?? []).map((b) => [b.id, Number(b.balance) || 0]));
    const changed = entered.filter((r) => Math.abs((freshBook.get(r.row.id) ?? r.book) - r.book) >= 0.0005);
    if (changed.length > 0) {
      toast.error('تغيّر رصيد خزينة أثناء العدّ — راجع الفروقات المحدّثة ثم اعتمد مرة أخرى.');
      return;
    }
    const ok = await confirm({
      title: 'اعتماد جرد الخزائن',
      description:
        diffs.length > 0
          ? 'يُرحَّل قيد تسوية بالفروقات، فيصبح رصيد كل خزينة مساوياً للمبلغ المعدود.'
          : 'الأرصدة مطابقة للعدّ؛ يُحفظ الجرد بلا قيد تسوية.',
      details:
        diffs.length > 0
          ? [
              { label: 'خزائن معدودة', value: <bdi>{entered.length}</bdi> },
              { label: 'خزائن بفروقات', value: <bdi>{diffs.length}</bdi> },
              { label: 'صافي الفروقات', value: formatMoney(net, 'LYD', { signed: true }) },
            ]
          : undefined,
      confirmLabel: 'اعتمد الجرد',
      tone: 'default',
    });
    if (!ok) return;

    apply.mutate(
      {
        pin,
        counts: entered.map((r) => ({
          cashbox_id: r.row.id,
          counted: r.counted,
        })),
        notes: notes.trim() || undefined,
        countDate,
      },
      {
        onSuccess: (res) => {
          setPinValue('');
          setCounts({});
          if (res.adjusted === 0) {
            toast.success('الجرد محفوظ — الأرصدة كانت مطابقة');
          } else {
            toast.success(`تم ترحيل تسوية ${res.adjusted} خزينة`);
          }
        },
        onError: (e) => toast.error(friendlyError(e, 'تعذّر اعتماد الجرد')),
      },
    );
  }

  if (roleLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-ink-soft" />
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="px-6 py-16 text-center">
        <p className="text-[15px] font-semibold">غير مصرّح بجرد الخزائن</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/cashboxes">العودة للخزائن</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="الخزائن"
        title="جرد الخزائن"
        description="أدخل العدّ الفعلي لكل خزينة. بعد الرقم السري يُرحَّل قيد يطابق الدفتر للواقع."
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/cashboxes">
              <ArrowLeft className="h-4 w-4" />
              الخزائن
            </Link>
          </Button>
        }
      />

      <div className="flex flex-col gap-6 px-4 py-5 sm:px-5 sm:py-7 md:px-8 md:py-10">
        <div className="surface flex gap-3 p-4 text-[13px] leading-relaxed text-ink-mute">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning-ink" />
          <p>
            الفائض يُسجَّل إيراداً (فائض جرد)، والعجز مصروفاً (عجز جرد). لا يُغيَّر رصيد
            الافتتاح — التسوية قيد يومية يمكن عكسه لاحقاً من دفتر القيود.
          </p>
        </div>

        <section className="surface flex flex-col gap-4 p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-foreground" />
            <h2 className="text-[14px] font-semibold">
              {pinSet ? 'تغيير الرقم السري' : 'ضبط الرقم السري (مرة أولى)'}
            </h2>
          </div>
          <p className="text-[12.5px] text-ink-mute">
            رقم من 4 إلى 8 أرقام. احفظه بعيداً عن الشاشة — مطلوب عند كل اعتماد جرد.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {pinSet ? (
              <div className="space-y-1.5">
                <Label htmlFor="current-pin">الرقم الحالي</Label>
                <Input
                  id="current-pin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  value={currentPin}
                  onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                />
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="new-pin">رقم جديد</Label>
              <Input
                id="new-pin"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-pin2">تأكيد الرقم</Label>
              <Input
                id="new-pin2"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={newPin2}
                onChange={(e) => setNewPin2(e.target.value.replace(/\D/g, '').slice(0, 8))}
              />
            </div>
          </div>
          <div>
            <Button
              size="sm"
              variant={pinSet ? 'outline' : 'default'}
              disabled={setPin.isPending || pinLoading || newPin.length < 4}
              onClick={handleSetPin}
            >
              {setPin.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {pinSet ? 'تغيير الرقم' : 'حفظ الرقم السري'}
            </Button>
          </div>
        </section>

        <section className="surface flex flex-col gap-4 p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-foreground" />
            <h2 className="text-[14px] font-semibold">العدّ الفعلي</h2>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 py-8 text-[13px] text-ink-mute">
              <Loader2 className="h-4 w-4 animate-spin" />
              جارٍ تحميل الأرصدة…
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-[13px]">
                <thead>
                  <tr className="border-b border-border text-start text-[11px] text-ink-mute">
                    <th className="py-2 font-medium">الخزينة</th>
                    <th className="py-2 font-medium">رصيد النظام</th>
                    <th className="py-2 font-medium">العدّ الفعلي</th>
                    <th className="py-2 font-medium">الفرق</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ row, book, counted, diff }) => (
                    <tr key={row.id} className="border-b border-border/70">
                      <td className="py-3">
                        <p className="font-semibold">{row.name_ar}</p>
                        <p className="text-[11px] text-ink-mute">
                          {row.kind === 'CASH' ? 'نقد' : 'مصرف'} · {row.code}
                        </p>
                      </td>
                      <td className="num py-3 tabular-nums">{formatMoney(book, row.currency || 'LYD')}</td>
                      <td className="py-3">
                        <Input
                          className="max-w-[160px] font-mono"
                          inputMode="decimal"
                          aria-label={`المبلغ المعدود في ${row.name_ar}`}
                          placeholder="لم تُعدّ"
                          value={counts[row.id] ?? ''}
                          onChange={(e) =>
                            setCounts((prev) => ({ ...prev, [row.id]: e.target.value }))
                          }
                        />
                      </td>
                      <td
                        className={cn(
                          'num py-3 tabular-nums font-semibold',
                          Number.isFinite(counted) && Math.abs(diff) >= 0.0005
                            ? diff > 0
                              ? 'text-pastel-greenInk'
                              : 'text-pastel-redInk'
                            : 'text-ink-mute',
                        )}
                      >
                        {!Number.isFinite(counted)
                          ? '—'
                          : formatMoney(diff, row.currency || 'LYD', { signed: true })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="count-date">تاريخ الجرد</Label>
              <Input
                id="count-date"
                type="date"
                value={countDate}
                onChange={(e) => setCountDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="count-notes">ملاحظة (اختياري)</Label>
              <Input
                id="count-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="مثال: جرد نهاية اليوم مع أمين الصندوق"
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1.5 max-w-xs">
              <Label htmlFor="apply-pin">الرقم السري للاعتماد</Label>
              <Input
                id="apply-pin"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={pin}
                onChange={(e) => setPinValue(e.target.value.replace(/\D/g, '').slice(0, 8))}
                disabled={!pinSet}
                placeholder={pinSet ? '••••' : 'اضبط الرقم أولاً'}
              />
            </div>
            <div className="flex flex-col items-stretch gap-2 sm:items-end">
              <p className="text-[12px] text-ink-mute">
                {diffs.length === 0
                  ? 'لا فروقات ظاهرة'
                  : `فروقات: ${diffs.length} · صافي ${formatMoney(net, 'LYD', { signed: true })}`}
              </p>
              <Button
                disabled={!pinSet || apply.isPending || isLoading || rows.length === 0}
                onClick={handleApply}
              >
                {apply.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                اعتماد الجرد وتحديث الأرصدة
              </Button>
            </div>
          </div>
        </section>

        {runs.length > 0 ? (
          <section className="flex flex-col gap-3">
            <h2 className="text-[11px] font-semibold text-ink-mute">
              آخر عمليات الجرد
            </h2>
            <div className="space-y-2">
              {runs.map((run) => {
                const netRun = (run.cashbox_inventory_lines ?? []).reduce(
                  (s, l) => s + Number(l.difference),
                  0,
                );
                return (
                  <div key={run.id} className="surface flex flex-col gap-1 p-4 text-[13px]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">{run.run_date}</span>
                      <span className="num tabular-nums text-ink-mute">
                        صافي {formatMoney(netRun, 'LYD', { signed: true })}
                      </span>
                    </div>
                    {run.notes ? <p className="text-[12px] text-ink-mute">{run.notes}</p> : null}
                    <ul className="text-[12px] text-ink-mute">
                      {(run.cashbox_inventory_lines ?? []).map((l) => {
                        const name =
                          balances.find((b) => b.id === l.cashbox_id)?.name_ar ?? 'خزينة';
                        return (
                          <li key={l.cashbox_id}>
                            {name}: عدّ {formatMoney(Number(l.counted_amount), 'LYD')} · فرق{' '}
                            {formatMoney(Number(l.difference), 'LYD')}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}
