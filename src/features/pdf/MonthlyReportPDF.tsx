// @ts-nocheck
import React from 'react';
import { Text, View } from '@react-pdf/renderer';
import { ReportShell } from './ReportShell';
import { ar } from './arabicPDF';
import { PDF } from './pdfBase';
import { pdfReportTable, PdfReportMoney, PdfReportCaption } from './pdfReportTable';
import { changePhrase, monthName, pctText, ratePhrase } from '@/lib/monthly-report-text';
import type { CategoryRow, MonthlyReport } from '@/lib/monthly-report';
import { arabicCount } from '@/lib/utils';

const dateLabel = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};
const days = (n: number) => arabicCount(n, ['يوم واحد', 'يومين', 'أيام', 'يوماً']);
const tenants = (n: number) => arabicCount(n, ['مستأجر واحد', 'مستأجران', 'مستأجرين', 'مستأجراً']);
const toneColor = (tone: string) => (tone === 'good' ? PDF.success : tone === 'bad' ? PDF.danger : PDF.muted);

/** Tables longer than this may continue on the next page; shorter ones always move whole, with their title. */
const KEEP_TOGETHER_ROWS = 12;

/** Room a breakable block needs below its start: title, note, column heads and two rows. */
const BLOCK_START_ROOM = 150;

/** A titled block. Whole on one page unless `keep` is false (a long table); rows never split either way. */
function Block({ title, note, keep = true, children }: { title: string; note?: string; keep?: boolean; children: React.ReactNode }) {
  return (
    <>
      {/*
        A block that may break is not atomic, so a rule on its own title cannot move it: the title is the first thing inside
        it and react-pdf only breaks an element that has something before it. This empty element in front of the block carries
        the rule instead: the title, the column heads and the first rows start on this page or the block starts on the next.
      */}
      {keep ? null : <View minPresenceAhead={BLOCK_START_ROOM} />}
      <View wrap={!keep}>
        <Text style={pdfReportTable.sectionTitle}>{ar(title)}</Text>
        {note ? <Text style={[pdfReportTable.caption, { marginTop: -4, marginBottom: 6 }]}>{ar(note)}</Text> : null}
        {children}
      </View>
    </>
  );
}

/** One table: a header row of { label, width, text? } and rows of ready cells. */
function Table({ columns, rows, foot }: { columns: { label: string; width: string; text?: boolean }[]; rows: React.ReactNode[][]; foot?: React.ReactNode[] }) {
  return (
    <View style={pdfReportTable.tableWrap}>
      <View style={pdfReportTable.tableHead} wrap={false}>
        {columns.map((c) => (
          <Text key={c.label} style={[c.text ? pdfReportTable.thAr : pdfReportTable.th, { width: c.width }]}>
            {ar(c.label)}
          </Text>
        ))}
      </View>
      {rows.map((cells, i) => (
        <View key={i} style={[pdfReportTable.tableRow, i % 2 === 1 ? pdfReportTable.rowAlt : {}]} wrap={false}>
          {cells.map((cell, j) => (
            <View key={j} style={{ width: columns[j].width }}>
              {cell}
            </View>
          ))}
        </View>
      ))}
      {foot ? (
        <View style={pdfReportTable.totalsRow} wrap={false}>
          {foot.map((cell, j) => (
            <View key={j} style={{ width: columns[j].width }}>
              {cell}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const money = (amount: number, extra = {}) => (
  <View style={[pdfReportTable.tdNum]}>
    <PdfReportMoney amount={amount} showZero {...extra} />
  </View>
);
const text = (s: string, extra = {}) => <Text style={[pdfReportTable.tdAr, extra]}>{ar(s)}</Text>;
const small = (s: string, color = PDF.muted) => <Text style={{ fontSize: 7.5, color, textAlign: 'right' }}>{ar(s)}</Text>;
const num = (s: string | number) => <Text style={[pdfReportTable.td, { textAlign: 'center' }]}>{String(s)}</Text>;
const boldText = (s: string) => text(s, { fontWeight: 'bold' });

function CategoryBlock({ title, rows, total, polarity, prevName }: { title: string; rows: CategoryRow[]; total: number; polarity: 'up-is-good' | 'down-is-good'; prevName: string }) {
  if (rows.length === 0) return null;
  return (
    <Block title={title}>
      <Table
        columns={[
          { label: 'النسبة', width: '11%' },
          { label: 'المبلغ', width: '21%' },
          { label: 'التغيّر', width: '34%', text: true },
          { label: 'البند', width: '34%', text: true },
        ]}
        rows={rows.map((r) => {
          const c = changePhrase(r.change, prevName, polarity);
          return [num(pctText(r.share)), money(r.amount), small(c.text, toneColor(c.tone)), text(r.name)];
        })}
        foot={[<View key="gap" />, money(total, { bold: true }), <View key="gap2" />, boldText('المجموع')]}
      />
    </Block>
  );
}

/** The owner's month on paper: money in and out, rent, who owes, where the cash sits, and the mall today. */
export function MonthlyReportPDF({ report }: { report: MonthlyReport }) {
  const { cash, rent, arrears, cashboxes, mall } = report;
  const prevName = monthName(report.prevMonthLabel);
  const rentRate = rent ? ratePhrase(rent.rateChange, prevName) : null;
  const cmp = (c, polarity) => changePhrase(c, prevName, polarity);
  const revenue = cmp(cash.change.revenue, 'up-is-good');
  const expense = cmp(cash.change.expense, 'down-is-good');
  const net = cmp(cash.change.net, 'up-is-good');
  // a section that could not be read is named, so its absence is never taken for "nothing to report"
  const left = [
    !rent && 'الإيجار',
    rent && !rent.prev && 'مقارنة نسبة التحصيل بالشهر السابق',
    !arrears && 'المتأخرات',
    !cashboxes && 'الخزائن',
    report.isCurrentMonth && !mall && 'المحلات والعقود',
  ].filter(Boolean) as string[];

  return (
    <ReportShell
      title="التقرير الشهري"
      subtitle={`${report.monthLabel}${report.isCurrentMonth ? ` · حتى ${dateLabel(report.asOf)}` : ''}`}
      documentTitle={`التقرير الشهري - ${report.monthLabel}`}
      summaryPrimaryDateIso={report.issuedOn}
      summaryPrimaryDateLabel="تاريخ الإصدار"
      metaCells={[
        { label: 'المحصّل', moneyAmount: cash.revenue },
        { label: 'المدفوع', moneyAmount: cash.expense },
        { label: 'صافي النقد', moneyAmount: cash.net },
      ]}
    >
      <Block title={`مقارنة مع ${report.prevMonthLabel}`}>
        <Table
          columns={[
            { label: 'التغيّر', width: '34%', text: true },
            { label: report.prevMonthLabel, width: '22%' },
            { label: report.monthLabel, width: '22%' },
            { label: 'البند', width: '22%', text: true },
          ]}
          rows={[
            [small(revenue.text, toneColor(revenue.tone)), money(cash.prev.revenue), money(cash.revenue), text('المحصّل (إيرادات)')],
            [small(expense.text, toneColor(expense.tone)), money(cash.prev.expense), money(cash.expense), text('المدفوع (مصروفات)')],
            [small(net.text, toneColor(net.tone)), money(cash.prev.net), money(cash.net, { bold: true }), boldText('صافي النقد')],
            ...(rent
              ? [[
                  small(rentRate ? rentRate.text : '', rentRate ? toneColor(rentRate.tone) : PDF.muted),
                  num(rent.prev ? pctText(rent.prev.rate) : '—'),
                  num(pctText(rent.rate)),
                  text('نسبة تحصيل إيجار الشهر'),
                ]]
              : []),
          ]}
        />
      </Block>

      {rent ? (
        <Block
          title="الإيجار"
          note={`عدد المستأجرين عليهم إيجار هذا الشهر: ${rent.tenants.paidFull + rent.tenants.partial + rent.tenants.unpaid} · أكملوا ${rent.tenants.paidFull} · دفعوا جزءاً ${rent.tenants.partial} · لم يدفعوا ${rent.tenants.unpaid}${rent.tenants.exempt ? ` · معفى ${rent.tenants.exempt}` : ''}${rent.tenants.noRent ? ` · بلا إيجار محدد ${rent.tenants.noRent}` : ''}`}
        >
          <Table
            columns={[
              { label: 'النسبة', width: '16%' },
              { label: 'المتبقي', width: '28%' },
              { label: 'المحصّل', width: '28%' },
              { label: 'المستحق', width: '28%' },
            ]}
            rows={[[num(pctText(rent.rate)), money(rent.remaining, { color: rent.remaining > 0 ? PDF.danger : undefined }), money(rent.collected), money(rent.due)]]}
          />
        </Block>
      ) : null}

      {arrears && arrears.tenants === 0 ? (
        <Block title="المتأخرات">
          <Text style={pdfReportTable.caption}>{ar(`لا متأخرات على المستأجرين حتى ${dateLabel(report.asOf)}.`)}</Text>
        </Block>
      ) : null}
      {arrears && arrears.tenants > 0 ? (
        <>
          <Block title="المتأخرات" note={`حتى ${dateLabel(report.asOf)} · ${tenants(arrears.tenants)} · الإجمالي كما في أعمار الذمم`}>
            <Table
              columns={[
                { label: 'أكثر من 60', width: '20%' },
                { label: 'من 31 إلى 60', width: '20%' },
                { label: 'من 1 إلى 30', width: '20%' },
                { label: 'جارٍ', width: '20%' },
                { label: 'الإجمالي', width: '20%' },
              ]}
              rows={[[money(arrears.buckets.d90), money(arrears.buckets.d60), money(arrears.buckets.d30), money(arrears.buckets.current), money(arrears.total, { bold: true, color: PDF.danger })]]}
            />
          </Block>
          <Block
            title="أكبر المتأخرين"
            note={arrears.tenants > arrears.top.length ? `الأعلى مبلغاً · ${arrears.top.length} من ${arrears.tenants} · الباقي في تقرير أعمار الذمم` : undefined}
          >
            <Table
              columns={[
                { label: 'المبلغ', width: '28%' },
                { label: 'المحل', width: '14%' },
                { label: 'المستأجر', width: '58%', text: true },
              ]}
              rows={arrears.top.map((d) => [money(d.amount, { color: PDF.danger }), num(d.shop ?? '—'), text(d.name)])}
            />
          </Block>
        </>
      ) : null}

      <CategoryBlock title="المصروفات حسب البند" rows={report.expenseRows} total={cash.expense} polarity="down-is-good" prevName={prevName} />
      <CategoryBlock title="الإيرادات حسب البند" rows={report.revenueRows} total={cash.revenue} polarity="up-is-good" prevName={prevName} />

      {cashboxes ? (
        <Block title="الخزائن" keep={cashboxes.rows.length <= KEEP_TOGETHER_ROWS} note={report.isCurrentMonth ? `الرصيد حتى ${dateLabel(report.asOf)}` : `الرصيد في ${dateLabel(report.end)}`}>
          <Table
            columns={[
              { label: 'آخر الشهر', width: '18%' },
              { label: 'تحويلات', width: '15%' },
              { label: 'صادر', width: '17%' },
              { label: 'وارد', width: '17%' },
              { label: 'أول الشهر', width: '17%' },
              { label: 'الخزينة', width: '16%', text: true },
            ]}
            rows={cashboxes.rows.map((b) => [money(b.closing, { bold: true }), money(b.transfersNet), money(b.outflow), money(b.inflow), money(b.opening), text(b.name)])}
            foot={[
              money(cashboxes.totals.closing, { bold: true }),
              money(cashboxes.totals.transfersNet),
              money(cashboxes.totals.outflow),
              money(cashboxes.totals.inflow),
              money(cashboxes.totals.opening),
              boldText('المجموع'),
            ]}
          />
        </Block>
      ) : null}

      {mall ? (
        <Block
          title="المحلات والعقود"
          note={`الوضع اليوم · إشغال ${pctText(mall.rate)} · مؤجر ${mall.rented} · شاغر ${mall.vacant}${mall.reserved ? ` · محجوز ${mall.reserved}` : ''}${mall.maintenance ? ` · صيانة ${mall.maintenance}` : ''}`}
        >
          {mall.expiry.total === 0 ? (
            <Text style={pdfReportTable.caption}>{ar('لا عقود تنتهي خلال 90 يوماً.')}</Text>
          ) : (
            <Table
              columns={[
                { label: 'الموعد', width: '30%' },
                { label: 'النهاية', width: '22%' },
                { label: 'المحل', width: '14%' },
                { label: 'المستأجر', width: '34%', text: true },
              ]}
              rows={mall.expiry.next.map((e) => [
                small(e.daysLeft < 0 ? `انتهى منذ ${days(-e.daysLeft)}` : e.daysLeft === 0 ? 'ينتهي اليوم' : `بعد ${days(e.daysLeft)}`, e.daysLeft < 0 ? PDF.danger : PDF.muted),
                num(dateLabel(e.endDate)),
                num(e.unitNumber ?? '—'),
                text(e.tenantName),
              ])}
            />
          )}
        </Block>
      ) : null}

      <Text style={pdfReportTable.caption}>
        {ar(
          `الأرقام نقدية: معاملات الشهر المرحّلة. تأمينات المستأجرين لا تدخل في الإيرادات والمصروفات${
            cash.depositsReceived > 0 || cash.depositsPaid > 0 ? `؛ قُبض منها هذا الشهر ${cash.depositsReceived.toLocaleString('en-US')} ورُدَّ ${cash.depositsPaid.toLocaleString('en-US')}` : ''
          }.`,
        )}
      </Text>
      {left.length > 0 ? <Text style={[pdfReportTable.caption, { color: PDF.danger }]}>{ar(`لم تُدرج في هذا التقرير لتعذّر تحميلها: ${left.join('، ')}.`)}</Text> : null}
      {cash.draftCount > 0 ? (
        <Text style={pdfReportTable.caption}>{ar(`معاملات الشهر المسودة (لم تُرحَّل بعد وليست في الأرقام): ${cash.draftCount}`)}</Text>
      ) : null}
      <PdfReportCaption />
    </ReportShell>
  );
}
