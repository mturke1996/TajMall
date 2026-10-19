// @ts-nocheck
import React from 'react';
import { Document, Text, View } from '@react-pdf/renderer';
import { ReportPage } from './ReportShell';
import { TenantStatementPage, TAIL_ROWS, FRAME_OPEN_BOTTOM, FRAME_OPEN_TOP } from './TenantStatementPDF';
import { BRAND } from '@/lib/brand';
import { ar } from './arabicPDF';
import { PDF } from './pdfBase';
import { pdfReportTable, PdfReportMoney, PdfReportCaption } from './pdfReportTable';
import type { TenantStatementsReport } from '@/lib/tenant-statements-report';
import { arabicCount } from '@/lib/utils';

const side = (n: number) => (n > 0.0005 ? 'عليه' : n < -0.0005 ? 'له' : '');
const tenantsLabel = (n: number) => arabicCount(n, ['مستأجر واحد', 'مستأجران', 'مستأجرين', 'مستأجراً']);

function BalanceMoney({ value, bold }: { value: number; bold?: boolean }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <PdfReportMoney amount={Math.abs(value)} bold={bold} showZero color={value > 0.0005 ? PDF.danger : PDF.text} />
      {side(value) ? <Text style={{ fontSize: 6.5, color: PDF.muted, textAlign: 'center' }}>{ar(side(value))}</Text> : null}
    </View>
  );
}

export type TenantStatementsBatchPdfProps = {
  report: TenantStatementsReport;
  periodLabel: string;
  /** YYYY-MM-DD */
  issuedOn: string;
};

/**
 * كشوف حساب كل المستأجرين في ملف واحد: صفحة ملخص بأرصدة الجميع، ثم كشف كل مستأجر كما يظهر في ملفه.
 */
export function TenantStatementsBatchPDF({ report, periodLabel, issuedOn }: TenantStatementsBatchPdfProps) {
  const { lines, totals, year, skipped } = report;
  const withOpening = year != null;
  const W = withOpening
    ? { balance: '16%', credit: '14%', debit: '14%', opening: '14%', name: '30%', shop: '12%' }
    : { balance: '18%', credit: '16%', debit: '16%', opening: '0%', name: '38%', shop: '12%' };
  const notes = [
    totals.ahead > 0.0005 ? 'صافي الأرصدة يطرح ما دفعه بعض المستأجرين مقدماً من المستحق على غيرهم.' : null,
    skipped > 0 ? `لم يُدرج ${tenantsLabel(skipped)} بلا مستحق ولا دفعات ولا رصيد في هذه الفترة.` : null,
    'تلي هذه الصفحة كشوف المستأجرين بالترتيب نفسه، كل كشف كما يظهر في ملف المستأجر.',
  ].filter(Boolean);

  const summaryRow = ({ tenant, statement: s }, i) => (
    <View key={tenant.id} style={[pdfReportTable.tableRow, i % 2 === 1 ? pdfReportTable.rowAlt : {}]} wrap={false}>
      <View style={[pdfReportTable.tdNum, { width: W.balance }]}>
        <BalanceMoney value={s.closing} />
      </View>
      <View style={[pdfReportTable.tdNum, { width: W.credit }]}>
        <PdfReportMoney amount={s.totalCredit} color={PDF.success} />
      </View>
      <View style={[pdfReportTable.tdNum, { width: W.debit }]}>
        <PdfReportMoney amount={s.totalDebit} />
      </View>
      {withOpening ? (
        <View style={[pdfReportTable.tdNum, { width: W.opening }]}>
          <BalanceMoney value={s.opening} />
        </View>
      ) : null}
      <View style={{ width: W.name }}>
        <Text style={pdfReportTable.tdAr}>{ar(tenant.name)}</Text>
        {!tenant.is_active ? (
          <Text style={{ fontSize: 7, color: PDF.muted, textAlign: 'right' }}>{ar('غير نشط')}</Text>
        ) : null}
      </View>
      <View style={{ width: W.shop, alignItems: 'center' }}>
        <Text style={{ fontSize: 8, color: PDF.text, textAlign: 'center' }}>{tenant.shop_number || '—'}</Text>
      </View>
    </View>
  );

  const body = lines.map(summaryRow);
  // the last TAIL_ROWS tenants, the totals row and the notes are one block, so the notes are never alone on a
  // page (see TenantStatementPDF for the page-break rules)
  const tailFrom = Math.max(0, body.length - TAIL_ROWS);

  const head = (
    <View style={pdfReportTable.tableHead} wrap={false} {...(tailFrom > 0 ? { fixed: true } : {})}>
      <Text style={[pdfReportTable.th, { width: W.balance }]}>{ar('الرصيد')}</Text>
      <Text style={[pdfReportTable.th, { width: W.credit }]}>{ar('المدفوع')}</Text>
      <Text style={[pdfReportTable.th, { width: W.debit }]}>{ar('المستحق')}</Text>
      {withOpening ? <Text style={[pdfReportTable.th, { width: W.opening }]}>{ar(`رصيد قبل ${year}`)}</Text> : null}
      <Text style={[pdfReportTable.thAr, { width: W.name }]}>{ar('المستأجر')}</Text>
      <Text style={[pdfReportTable.th, { width: W.shop }]}>{ar('المحل')}</Text>
    </View>
  );

  const totalsRow = (
    <View style={pdfReportTable.totalsRow} wrap={false}>
      <View style={[pdfReportTable.tdNum, { width: W.balance }]}>
        <BalanceMoney value={totals.closing} bold />
      </View>
      <View style={[pdfReportTable.tdNum, { width: W.credit }]}>
        <PdfReportMoney amount={totals.credit} bold showZero />
      </View>
      <View style={[pdfReportTable.tdNum, { width: W.debit }]}>
        <PdfReportMoney amount={totals.debit} bold showZero />
      </View>
      {withOpening ? (
        <View style={[pdfReportTable.tdNum, { width: W.opening }]}>
          <BalanceMoney value={totals.opening} bold />
        </View>
      ) : null}
      <View style={{ width: W.name }}>
        <Text style={pdfReportTable.totalsRowLabel}>{ar(`المجموع (${tenantsLabel(lines.length)})`)}</Text>
      </View>
      <View style={{ width: W.shop }} />
    </View>
  );

  return (
    <Document title={`كشوف حساب المستأجرين - ${periodLabel}`} author={BRAND.fullName}>
      <ReportPage
        title="كشوف حساب المستأجرين"
        titleEn="STATEMENT"
        subtitle={`${tenantsLabel(lines.length)} · ${periodLabel}`}
        summaryPrimaryDateIso={issuedOn}
        summaryPrimaryDateLabel="تاريخ الكشوف"
        metaCells={[
          { label: 'الإيجار المستحق', moneyAmount: totals.debit },
          { label: 'المدفوع', moneyAmount: totals.credit },
          { label: 'على المستأجرين', moneyAmount: totals.owed },
        ]}
      >
        {tailFrom > 0 ? (
          <View style={[pdfReportTable.tableWrap, FRAME_OPEN_BOTTOM]}>
            {head}
            {body.slice(0, tailFrom)}
          </View>
        ) : null}
        <View wrap={false}>
          <View style={[pdfReportTable.tableWrap, tailFrom > 0 ? FRAME_OPEN_TOP : { marginBottom: 0 }]}>
            {tailFrom > 0 ? null : head}
            {body.slice(tailFrom)}
            {totalsRow}
          </View>

          {notes.map((text, i) => (
            <Text key={i} style={[pdfReportTable.caption, { marginTop: i === 0 ? 16 : 3, lineHeight: 1.35 }]}>
              {ar(text)}
            </Text>
          ))}
          <PdfReportCaption />
        </View>
      </ReportPage>

      {lines.map(({ tenant, statement }) => (
        <TenantStatementPage
          key={tenant.id}
          tenantName={tenant.name}
          shopNumber={tenant.shop_number}
          phone={tenant.phone}
          periodLabel={periodLabel}
          issuedOn={issuedOn}
          statement={statement}
        />
      ))}
    </Document>
  );
}
