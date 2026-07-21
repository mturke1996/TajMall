import { createSupabaseAdminClient } from '@/lib/supabase/server';
import { BrandGlyph } from '@/components/brand/logo';
import { formatDate, formatMoney } from '@/lib/utils';
import { BRAND } from '@/lib/brand';
import { normalizeRpcRentCalendar } from '@/lib/rent-calendar-from-charges';
import {
  currentMonthKey,
  currentYear,
  formatMonthLabelAr,
  monthNameAr,
  RENT_MONTH_STATUS_LABEL,
  type RentMonthStatus,
} from '@/lib/rent-months';
import {
  resolveAmountFromBands,
  type RentPriceBand,
} from '@/lib/rent-price-schedule';

export const dynamic = 'force-dynamic';

type ChargeRow = {
  id: string;
  amount: string;
  due_date: string;
  type: string;
  description: string;
  status: string;
  total_paid: string;
};

const CHARGE_TYPE_LABEL: Record<string, string> = {
  RENT: 'إيجار',
  SERVICE: 'خدمات',
  FINE: 'غرامة',
  OTHER: 'أخرى',
};

const STATUS_LABEL: Record<string, string> = {
  UNPAID: 'غير مسدَّد',
  PARTIAL: 'مسدَّد جزئياً',
  PAID: 'مسدَّد',
};

const STATUS_TONE: Record<string, string> = {
  UNPAID: 'bg-rose-50 text-rose-700 border-rose-200',
  PARTIAL: 'bg-amber-50 text-amber-800 border-amber-200',
  PAID: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const CAL_CELL: Record<RentMonthStatus, string> = {
  paid: 'border-emerald-500 bg-emerald-50/40 text-emerald-800',
  partial: 'border-amber-500 bg-amber-50/40 text-amber-800',
  unpaid: 'border-rose-500 bg-rose-50/40 text-rose-800',
  no_charge: 'border-slate-300 bg-white text-slate-600',
  exempt: 'border-dashed border-slate-300 bg-slate-50 text-slate-500',
  na: 'border-[#ECEAE3] bg-[#FBFBFA] text-[#9a9a9a]',
};

function chargeRemaining(c: ChargeRow): number {
  if (c.status === 'PAID') return 0;
  return Math.max(0, Number(c.amount) - Number(c.total_paid));
}

/**
 * صفحة عامة (بلا تسجيل دخول) — كل البيانات تُجلب على الخادم بمفتاح
 * service_role عبر التوكن فقط. لا تُستخدم جلسة المستخدم أو RLS هنا
 * إطلاقاً، فلا خطر على بقية بيانات النظام.
 */
export default async function TenantPortalPage({ params }: { params: { token: string } }) {
  const token = params.token?.trim();
  if (!token) return <InvalidLink />;

  const supabase = createSupabaseAdminClient();

  const { data: contact } = await supabase
    .from('contacts')
    .select('id, name, shop_number, floor, monthly_rent, phone')
    .eq('portal_token', token)
    .maybeSingle();

  if (!contact) return <InvalidLink />;

  const year = currentYear();
  const thisMonth = currentMonthKey(year);
  const defaultRent = Number(contact.monthly_rent) || 0;

  const [{ data: contracts }, { data: bandsRaw }, { data: calendarRaw }] =
    await Promise.all([
      supabase
        .from('lease_contracts')
        .select('id, start_date, end_date, monthly_rent, status')
        .eq('tenant_id', contact.id)
        .order('start_date', { ascending: false }),
      supabase
        .from('tenant_rent_price_bands')
        .select('id, from_month, to_month, amount, notes')
        .eq('tenant_id', contact.id)
        .order('from_month', { ascending: true }),
      supabase.rpc('get_tenant_rent_calendar', {
        p_tenant_id: contact.id,
        p_year: year,
      }),
    ]);

  const bands = (bandsRaw ?? []).map((b) => ({
    id: b.id as string,
    from_month: String(b.from_month),
    to_month: String(b.to_month),
    amount: Number(b.amount),
    notes: (b.notes as string | null) ?? null,
  })) as RentPriceBand[];

  const calendar = normalizeRpcRentCalendar(calendarRaw, contact.id, year);
  const calendarMonths = (calendar?.months ?? []).filter((m) => m.status !== 'na');

  const contractIds = (contracts ?? []).map((c) => c.id as string);

  let charges: ChargeRow[] = [];
  if (contractIds.length > 0) {
    const { data } = await supabase
      .from('tenant_charges')
      .select('id, amount, due_date, type, description, status, total_paid')
      .in('contract_id', contractIds)
      .order('due_date', { ascending: false })
      .limit(60);
    charges = (data ?? []) as ChargeRow[];
  }

  const totalOutstanding = charges.reduce((sum, c) => sum + chargeRemaining(c), 0);

  const monthFromCalendar = calendar?.months.find((m) => m.month === thisMonth);
  const currentRent =
    (monthFromCalendar && monthFromCalendar.amount > 0
      ? monthFromCalendar.amount
      : null) ??
    resolveAmountFromBands(bands, thisMonth, defaultRent) ??
    defaultRent;

  const hasVariablePrices = bands.length > 0;
  const paidCount = calendarMonths.filter((m) => m.status === 'paid').length;
  const openCount = calendarMonths.filter(
    (m) => m.status === 'unpaid' || m.status === 'partial',
  ).length;

  /** سعر العرض: جدول الأسعار الحالي، لا مبلغ تحصيل قديم */
  function monthDisplayAmount(monthKeyStr: string, fallback = 0): number {
    const fromBand = resolveAmountFromBands(bands, monthKeyStr, 0);
    if (fromBand > 0) return fromBand;
    const fromCal = calendar?.months.find((m) => m.month === monthKeyStr);
    const scheduled = Number(
      (fromCal as { scheduled_amount?: number } | undefined)?.scheduled_amount ?? 0,
    );
    if (scheduled > 0) return scheduled;
    const amt = Number(fromCal?.amount ?? 0);
    if (amt > 0) return amt;
    return fallback > 0 ? fallback : defaultRent;
  }

  function chargeDisplayAmount(c: ChargeRow): number {
    if (c.type !== 'RENT') return Number(c.amount) || 0;
    const mk = String(c.due_date).slice(0, 7);
    return monthDisplayAmount(mk, Number(c.amount) || 0);
  }

  return (
    <div className="min-h-screen bg-[#FBFBFA] px-4 py-8 sm:px-6" dir="rtl">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <header className="flex items-center gap-3">
          <BrandGlyph size={44} />
          <div>
            <p className="text-[13px] font-semibold text-[#15171A]">{BRAND.fullName}</p>
            <p className="text-[11px] text-[#6b6f68]">بوابة المستأجر الذاتية</p>
          </div>
        </header>

        <div className="rounded-2xl border border-[#ECEAE3] bg-white p-5 shadow-sm">
          <p className="text-[12px] text-[#6b6f68]">مستأجر</p>
          <h1 className="mt-0.5 text-xl font-bold text-[#15171A]">{contact.name}</h1>
          {(contact.shop_number || contact.floor) && (
            <p className="mt-1 text-[13px] text-[#6b6f68]">
              {contact.shop_number ? `محل ${contact.shop_number}` : ''}
              {contact.shop_number && contact.floor ? ' · ' : ''}
              {contact.floor ? `طابق ${contact.floor}` : ''}
            </p>
          )}

          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[#ECEAE3] pt-4">
            <div>
              <p className="text-[11px] text-[#6b6f68]">
                إيجار {monthNameAr(thisMonth)}
                {hasVariablePrices ? ' (حسب الجدول)' : ''}
              </p>
              <p className="mt-0.5 text-[15px] font-semibold text-[#15171A]">
                {formatMoney(currentRent, 'LYD')}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-[#6b6f68]">إجمالي المستحق</p>
              <p
                className={`mt-0.5 text-[15px] font-bold ${
                  totalOutstanding > 0 ? 'text-rose-700' : 'text-emerald-700'
                }`}
              >
                {formatMoney(totalOutstanding, 'LYD')}
              </p>
            </div>
          </div>
        </div>

        {calendarMonths.length > 0 && (
          <div className="rounded-2xl border border-[#ECEAE3] bg-white p-5 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[14px] font-semibold text-[#15171A]">
                تقويم الإيجار {year}
              </h2>
              <p className="text-[11px] text-[#6b6f68]">
                مدفوع {paidCount} · مستحق {openCount}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {calendarMonths.map((m) => {
                const price = monthDisplayAmount(m.month, Number(m.amount) || 0);
                return (
                  <div
                    key={m.month}
                    title={`${formatMonthLabelAr(m.month)} — ${RENT_MONTH_STATUS_LABEL[m.status]} · ${formatMoney(price, '')}`}
                    className={`rounded-xl border-2 px-2 py-2.5 text-center ${CAL_CELL[m.status]}`}
                  >
                    <p className="text-[12px] font-semibold">{monthNameAr(m.month)}</p>
                    <p className="mt-0.5 text-[10px] font-medium">
                      {RENT_MONTH_STATUS_LABEL[m.status]}
                    </p>
                    {price > 0 && (
                      <p className="mt-0.5 font-mono text-[10px] opacity-80">
                        {formatMoney(price, '')}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {hasVariablePrices && (
          <div className="rounded-2xl border border-[#ECEAE3] bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-[14px] font-semibold text-[#15171A]">
              جدول أسعار الإيجار
            </h2>
            <ul className="flex flex-col divide-y divide-[#ECEAE3]">
              {bands.map((b) => (
                <li
                  key={b.id ?? `${b.from_month}-${b.to_month}`}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <p className="text-[13px] text-[#15171A]">
                    {b.from_month === b.to_month
                      ? formatMonthLabelAr(b.from_month)
                      : `${formatMonthLabelAr(b.from_month)} → ${formatMonthLabelAr(b.to_month)}`}
                  </p>
                  <p className="shrink-0 font-mono text-[13px] font-semibold text-[#15171A]">
                    {formatMoney(b.amount, 'LYD')}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="rounded-2xl border border-[#ECEAE3] bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-[14px] font-semibold text-[#15171A]">سجل المطالبات والسداد</h2>
          {charges.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-[#6b6f68]">لا توجد مطالبات مسجَّلة</p>
          ) : (
            <ul className="flex flex-col divide-y divide-[#ECEAE3]">
              {charges.map((c) => {
                const displayAmount = chargeDisplayAmount(c);
                const remaining =
                  c.status === 'PAID'
                    ? 0
                    : Math.max(0, displayAmount - Number(c.total_paid));
                return (
                  <li key={c.id} className="flex items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-[#15171A]">
                        {CHARGE_TYPE_LABEL[c.type] ?? c.type}
                        {c.type === 'RENT'
                          ? ` — ${formatMonthLabelAr(String(c.due_date).slice(0, 7))}`
                          : ` — ${c.description}`}
                      </p>
                      <p className="mt-0.5 text-[11px] text-[#6b6f68]" dir="ltr">
                        {formatDate(c.due_date)}
                      </p>
                      {c.status === 'PARTIAL' && (
                        <p className="mt-0.5 text-[11px] text-amber-700">
                          مدفوع {formatMoney(Number(c.total_paid), '')} · متبقي{' '}
                          {formatMoney(remaining, '')}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 text-left">
                      <p className="font-mono text-[13px] font-semibold text-[#15171A]">
                        {formatMoney(displayAmount, '')}
                      </p>
                      <span
                        className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_TONE[c.status] ?? ''}`}
                      >
                        {STATUS_LABEL[c.status] ?? c.status}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <p className="text-center text-[11px] text-[#9a9a9a]">
          هذا رابط خاص بك — لا تشاركه مع أحد. لأي استفسار تواصل مباشرة مع إدارة {BRAND.name}.
        </p>
      </div>
    </div>
  );
}

function InvalidLink() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FBFBFA] px-6" dir="rtl">
      <div className="text-center">
        <h1 className="text-lg font-semibold text-[#15171A]">الرابط غير صالح</h1>
        <p className="mt-1 text-[13px] text-[#6b6f68]">
          هذا الرابط منتهي أو غير صحيح. تواصل مع إدارة المول للحصول على رابط جديد.
        </p>
      </div>
    </div>
  );
}
