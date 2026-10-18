'use client';

import Link from 'next/link';
import { WhatsAppMessageButton } from '@/components/tenants/whatsapp-message-button';
import { RateBar } from '@/components/mall/occupancy-summary';
import { changePhrase, monthName, pctText, ratePhrase, type Polarity, type Tone } from '@/lib/monthly-report-text';
import type { CategoryRow, MonthlyReport } from '@/lib/monthly-report';
import { buildRentReminderMessage } from '@/lib/whatsapp';
import { arabicCount, cn, formatDate, formatMoney } from '@/lib/utils';

const TONE: Record<Tone, string> = { good: 'text-success-ink', bad: 'text-danger-ink', neutral: 'text-ink-mute' };

function Figure({ label, children, hint, tone = 'neutral' }: { label: string; children: React.ReactNode; hint?: string; tone?: Tone }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 bg-card p-4">
      <p className="text-[12.5px] text-ink-mute">{label}</p>
      <p className="text-[20px] font-semibold tabular-nums text-foreground">{children}</p>
      {hint && <p className={cn('text-[12px]', TONE[tone])}>{hint}</p>}
    </div>
  );
}

function Section({ id, title, aside, children }: { id: string; title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1">
        <h2 id={id} className="text-[15px] font-semibold text-foreground">
          {title}
        </h2>
        {aside && <p className="text-[12.5px] tabular-nums text-ink-mute">{aside}</p>}
      </div>
      {children}
    </section>
  );
}

function Missing({ what }: { what: string }) {
  return <p className="surface px-4 py-6 text-center text-[13px] text-ink-mute">تعذّر تحميل {what}. أعد فتح الصفحة بعد قليل.</p>;
}

function CategoryTable({
  rows,
  total,
  polarity,
  prevName,
  empty,
}: {
  rows: CategoryRow[];
  total: number;
  polarity: Polarity;
  prevName: string;
  empty: string;
}) {
  if (rows.length === 0) return <p className="surface px-4 py-6 text-center text-[13px] text-ink-mute">{empty}</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[360px] text-[13px]">
        <thead className="bg-canvas-sunken/60 text-[12px] text-ink-mute">
          <tr className="border-b border-border">
            <th scope="col" className="px-3 py-2.5 text-start font-medium">البند</th>
            <th scope="col" className="px-3 py-2.5 text-end font-medium">المبلغ</th>
            <th scope="col" className="px-3 py-2.5 text-end font-medium">النسبة</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => {
            const c = changePhrase(r.change, prevName, polarity);
            return (
              <tr key={r.key}>
                <td className="px-3 py-2.5">
                  <span className="block text-foreground">{r.name}</span>
                  <span className={cn('block text-[12px]', TONE[c.tone])}>{c.text}</span>
                </td>
                <td className="px-3 py-2.5 text-end tabular-nums">{formatMoney(r.amount, '')}</td>
                <td className="px-3 py-2.5 text-end tabular-nums text-ink-soft">{pctText(r.share)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="border-t border-border bg-canvas-sunken/40 font-semibold">
          <tr>
            <td className="px-3 py-2.5">المجموع</td>
            <td className="px-3 py-2.5 text-end tabular-nums">{formatMoney(total, '')}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

const tenants = (n: number) => arabicCount(n, ['مستأجر واحد', 'مستأجران', 'مستأجرين', 'مستأجراً']);
const days = (n: number) => arabicCount(n, ['يوم واحد', 'يومين', 'أيام', 'يوماً']);

export function MonthlyReportView({ report, rentPrevMissing }: { report: MonthlyReport; rentPrevMissing: boolean }) {
  const { cash, rent, arrears, cashboxes, mall } = report;
  const prevName = monthName(report.prevMonthLabel);
  const revenue = changePhrase(cash.change.revenue, prevName, 'up-is-good');
  const expense = changePhrase(cash.change.expense, prevName, 'down-is-good');
  const net = changePhrase(cash.change.net, prevName, 'up-is-good');
  const rate = rent ? ratePhrase(rent.rateChange, prevName) : null;

  return (
    <div className="flex flex-col gap-6">
      {report.isCurrentMonth && (
        <p className="px-1 text-[12.5px] text-ink-mute">
          الشهر لم ينتهِ بعد: الأرقام من {formatDate(report.start)} حتى {formatDate(report.asOf)}، وتُقارَن بالشهر السابق كاملاً.
        </p>
      )}

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-4">
        <Figure label="المحصّل" hint={revenue.text} tone={revenue.tone}>
          {formatMoney(cash.revenue, 'LYD')}
        </Figure>
        <Figure label="المدفوع" hint={expense.text} tone={expense.tone}>
          {formatMoney(cash.expense, 'LYD')}
        </Figure>
        <Figure label="صافي النقد" hint={net.text} tone={net.tone}>
          <span className={cn(cash.net < 0 && 'text-danger-ink')}>{formatMoney(cash.net, 'LYD')}</span>
        </Figure>
        <Figure label="تحصيل إيجار الشهر" hint={rate?.text} tone={rate?.tone}>
          {rent ? pctText(rent.rate) : '—'}
        </Figure>
      </div>

      <Section
        id="rent-heading"
        title="الإيجار"
        aside={rent ? `${tenants(rent.tenants.paidFull + rent.tenants.partial + rent.tenants.unpaid)} عليهم إيجار هذا الشهر` : undefined}
      >
        {!rent ? (
          <Missing what="إيجار الشهر" />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
              <Figure label="المستحق">{formatMoney(rent.due, 'LYD')}</Figure>
              <Figure label="المحصّل">{formatMoney(rent.collected, 'LYD')}</Figure>
              <Figure label="المتبقي">
                <span className={cn(rent.remaining > 0 && 'text-danger-ink')}>{formatMoney(rent.remaining, 'LYD')}</span>
              </Figure>
              <Figure label="النسبة">{pctText(rent.rate)}</Figure>
            </div>
            <div className="px-1">
              <RateBar rate={rent.rate} label={`نسبة التحصيل ${pctText(rent.rate)}`} />
            </div>
            <ul className="flex flex-wrap gap-x-5 gap-y-1 px-1 text-[12.5px] text-ink-soft" aria-label="المستأجرون حسب حالة إيجار الشهر">
              <li>أكملوا <span className="tabular-nums text-foreground">{rent.tenants.paidFull}</span></li>
              <li>دفعوا جزءاً <span className="tabular-nums text-foreground">{rent.tenants.partial}</span></li>
              <li>لم يدفعوا <span className="tabular-nums text-foreground">{rent.tenants.unpaid}</span></li>
              {rent.tenants.exempt > 0 && <li>معفى <span className="tabular-nums text-foreground">{rent.tenants.exempt}</span></li>}
              {rent.tenants.noRent > 0 && <li>بلا إيجار محدد <span className="tabular-nums text-foreground">{rent.tenants.noRent}</span></li>}
            </ul>
            {rentPrevMissing && <p className="px-1 text-[12px] text-ink-mute">تعذّرت مقارنة نسبة التحصيل بالشهر السابق.</p>}
          </>
        )}
      </Section>

      <Section
        id="arrears-heading"
        title="المتأخرات"
        aside={arrears ? `حتى ${formatDate(report.asOf)} · ${tenants(arrears.tenants)}` : undefined}
      >
        {!arrears ? (
          <Missing what="المتأخرات" />
        ) : arrears.tenants === 0 ? (
          <p className="surface px-4 py-6 text-center text-[13px] text-ink-mute">لا متأخرات على أي مستأجر.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-5">
              <Figure label="الإجمالي">
                <span className="text-danger-ink">{formatMoney(arrears.total, 'LYD')}</span>
              </Figure>
              <Figure label="جارٍ">{formatMoney(arrears.buckets.current, '')}</Figure>
              <Figure label="1 إلى 30 يوماً">{formatMoney(arrears.buckets.d30, '')}</Figure>
              <Figure label="31 إلى 60 يوماً">{formatMoney(arrears.buckets.d60, '')}</Figure>
              <Figure label="أكثر من 60 يوماً">
                <span className={cn(arrears.buckets.d90 > 0 && 'text-danger-ink')}>{formatMoney(arrears.buckets.d90, '')}</span>
              </Figure>
            </div>
            <ul className="surface divide-y divide-border overflow-hidden">
              {arrears.top.map((d) => (
                <li key={d.tenantId} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="min-w-0 flex-1">
                    <Link href={`/contacts/${d.tenantId}?tab=statement`} className="block truncate text-[13.5px] font-medium text-foreground hover:underline">
                      {d.name}
                    </Link>
                    <span className="block text-[12px] text-ink-mute">{d.shop ? `محل ${d.shop}` : 'بلا محل'}</span>
                  </span>
                  <span className="shrink-0 text-[13.5px] font-semibold tabular-nums text-danger-ink">{formatMoney(d.amount, 'LYD')}</span>
                  <WhatsAppMessageButton
                    phone={d.phone}
                    label={null}
                    title={`تذكير ${d.name} بالمستحقات عبر واتساب`}
                    message={buildRentReminderMessage({ tenantName: d.name, amountOutstanding: d.amount, shopNumber: d.shop, asOf: formatDate(report.asOf) })}
                  />
                </li>
              ))}
            </ul>
            {arrears.tenants > arrears.top.length && (
              <p className="px-1 text-[12px] text-ink-mute">
                الأكبر {arrears.top.length} من {tenants(arrears.tenants)}. <Link href="/reports/ar-aging" className="underline-offset-2 hover:underline">أعمار الذمم كاملة</Link>
              </p>
            )}
          </>
        )}
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section id="expense-heading" title="المصروفات حسب البند" aside={formatMoney(cash.expense, 'LYD')}>
          <CategoryTable rows={report.expenseRows} total={cash.expense} polarity="down-is-good" prevName={prevName} empty="لا مصروفات في هذا الشهر." />
        </Section>
        <Section id="revenue-heading" title="الإيرادات حسب البند" aside={formatMoney(cash.revenue, 'LYD')}>
          <CategoryTable rows={report.revenueRows} total={cash.revenue} polarity="up-is-good" prevName={prevName} empty="لا إيرادات في هذا الشهر." />
        </Section>
      </div>

      <Section id="cashboxes-heading" title="الخزائن" aside={report.isCurrentMonth ? `الرصيد حتى ${formatDate(report.asOf)}` : `الرصيد في ${formatDate(report.end)}`}>
        {!cashboxes ? (
          <Missing what="الخزائن" />
        ) : (
          <>
          <ul className="surface divide-y divide-border overflow-hidden sm:hidden" aria-label="الخزائن">
            {[...cashboxes.rows.map((b) => ({ key: b.id, total: false, ...b })), { key: 'total', total: true, name: 'المجموع', ...cashboxes.totals }].map((b) => (
              <li key={b.key} className={cn('px-4 py-3', b.total && 'bg-canvas-sunken/40')}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className={cn('min-w-0 truncate text-[13.5px] text-foreground', b.total ? 'font-semibold' : 'font-medium')}>{b.name}</span>
                  <span className="shrink-0 text-[14px] font-semibold tabular-nums">{formatMoney(b.closing, 'LYD')}</span>
                </div>
                <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[12px] text-ink-mute">
                  {[
                    ['أول الشهر', formatMoney(b.opening, '')],
                    ['وارد', b.inflow > 0 ? formatMoney(b.inflow, '') : '—'],
                    ['صادر', b.outflow > 0 ? formatMoney(b.outflow, '') : '—'],
                    ['تحويلات', b.transfersNet !== 0 ? formatMoney(b.transfersNet, '', { signed: true }) : '—'],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-baseline justify-between gap-2">
                      <dt>{label}</dt>
                      <dd className="tabular-nums text-ink-soft">{value}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto rounded-lg border border-border sm:block">
            <table className="w-full min-w-[620px] text-[13px]">
              <thead className="bg-canvas-sunken/60 text-[12px] text-ink-mute">
                <tr className="border-b border-border">
                  <th scope="col" className="px-3 py-2.5 text-start font-medium">الخزينة</th>
                  <th scope="col" className="px-3 py-2.5 text-end font-medium">أول الشهر</th>
                  <th scope="col" className="px-3 py-2.5 text-end font-medium">وارد</th>
                  <th scope="col" className="px-3 py-2.5 text-end font-medium">صادر</th>
                  <th scope="col" className="px-3 py-2.5 text-end font-medium">تحويلات</th>
                  <th scope="col" className="px-3 py-2.5 text-end font-medium">آخر الشهر</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {cashboxes.rows.map((b) => (
                  <tr key={b.id}>
                    <th scope="row" className="px-3 py-2.5 text-start font-medium text-foreground">{b.name}</th>
                    <td className="px-3 py-2.5 text-end tabular-nums text-ink-soft">{formatMoney(b.opening, '')}</td>
                    <td className="px-3 py-2.5 text-end tabular-nums">{b.inflow > 0 ? formatMoney(b.inflow, '') : '—'}</td>
                    <td className="px-3 py-2.5 text-end tabular-nums">{b.outflow > 0 ? formatMoney(b.outflow, '') : '—'}</td>
                    <td className="px-3 py-2.5 text-end tabular-nums text-ink-soft">{b.transfersNet !== 0 ? formatMoney(b.transfersNet, '', { signed: true }) : '—'}</td>
                    <td className="px-3 py-2.5 text-end font-medium tabular-nums">{formatMoney(b.closing, '')}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-border bg-canvas-sunken/40 font-semibold">
                <tr>
                  <td className="px-3 py-2.5">المجموع</td>
                  <td className="px-3 py-2.5 text-end tabular-nums">{formatMoney(cashboxes.totals.opening, '')}</td>
                  <td className="px-3 py-2.5 text-end tabular-nums">{formatMoney(cashboxes.totals.inflow, '')}</td>
                  <td className="px-3 py-2.5 text-end tabular-nums">{formatMoney(cashboxes.totals.outflow, '')}</td>
                  <td className="px-3 py-2.5 text-end tabular-nums">{cashboxes.totals.transfersNet !== 0 ? formatMoney(cashboxes.totals.transfersNet, '', { signed: true }) : '—'}</td>
                  <td className="px-3 py-2.5 text-end tabular-nums">{formatMoney(cashboxes.totals.closing, '')}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          </>
        )}
      </Section>

      {mall && (
        <Section id="mall-heading" title="المحلات والعقود" aside="الوضع اليوم">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
            <Figure label="نسبة الإشغال">{pctText(mall.rate)}</Figure>
            <Figure label="مؤجر">{mall.rented}</Figure>
            <Figure label="شاغر" hint={mall.longVacant > 0 ? `${mall.longVacant} منها منذ 3 أشهر أو أكثر` : undefined} tone="bad">
              {mall.vacant}
            </Figure>
            <Figure label="الإيجار الشهري المتعاقد">{formatMoney(mall.rentRoll, 'LYD')}</Figure>
          </div>
          {mall.expiry.total === 0 ? (
            <p className="px-1 text-[12.5px] text-ink-mute">لا عقود تنتهي خلال 90 يوماً.</p>
          ) : (
            <>
              <p className="px-1 text-[12.5px] text-ink-soft">
                {arabicCount(mall.expiry.total, ['عقد واحد', 'عقدان', 'عقود', 'عقداً'])} تحتاج قراراً · إيجارها الشهري {formatMoney(mall.expiry.rentAtRisk, 'LYD')}
                {mall.expiry.expired > 0 && ` · منها ${mall.expiry.expired} انتهى وما زال نشطاً`}
              </p>
              <ul className="surface divide-y divide-border overflow-hidden">
                {mall.expiry.next.map((e) => (
                  <li key={`${e.tenantName}-${e.endDate}`} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] font-medium text-foreground">{e.tenantName}</span>
                      <span className="block text-[12px] text-ink-mute">{e.unitNumber ? `محل ${e.unitNumber}` : 'بلا وحدة'}</span>
                    </span>
                    <span className="shrink-0 text-end">
                      <span className="block text-[13px] tabular-nums">{formatDate(e.endDate)}</span>
                      <span className={cn('block text-[12px]', e.daysLeft < 0 ? 'text-danger-ink' : e.daysLeft <= 30 ? 'text-warning-ink' : 'text-ink-mute')}>
                        {e.daysLeft < 0 ? `انتهى منذ ${days(-e.daysLeft)}` : e.daysLeft === 0 ? 'ينتهي اليوم' : `بعد ${days(e.daysLeft)}`}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="px-1 text-[12px] text-ink-mute">
                <Link href="/mall?tab=contracts" className="underline-offset-2 hover:underline">العقود</Link> · <Link href="/mall?tab=units" className="underline-offset-2 hover:underline">المحلات والإشغال</Link>
              </p>
            </>
          )}
        </Section>
      )}

      <div className="flex flex-col gap-1 px-1 text-[12px] leading-relaxed text-ink-mute">
        <p>
          الأرقام نقدية: معاملات الشهر المرحّلة. تأمينات المستأجرين لا تدخل في الإيرادات والمصروفات
          {(cash.depositsReceived > 0 || cash.depositsPaid > 0) &&
            `؛ في هذا الشهر قُبض منها ${formatMoney(cash.depositsReceived, 'LYD')} ورُدَّ ${formatMoney(cash.depositsPaid, 'LYD')}`}
          .
        </p>
        {cash.draftCount > 0 && <p className="text-warning-ink">معاملات الشهر المسودة (لم تُرحَّل بعد وليست في الأرقام): {cash.draftCount}</p>}
      </div>
    </div>
  );
}
