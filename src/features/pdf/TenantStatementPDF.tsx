// @ts-nocheck
import React from 'react';
import { Document, Text, View } from '@react-pdf/renderer';
import { ReportPage } from './ReportShell';
import { BRAND } from '@/lib/brand';
import { ar } from './arabicPDF';
import { PDF } from './pdfBase';
import { pdfReportTable, PdfReportMoney, PdfReportCaption } from './pdfReportTable';
import type { TenantStatement } from '@/lib/tenant-statement';
import { statementBalanceLabel } from '@/lib/tenant-statement';

const W = { balance: '17%', credit: '15%', debit: '15%', desc: '39%', date: '14%' };

const dateLabel = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};
const side = (n: number) => (n > 0.0005 ? 'عليه' : n < -0.0005 ? 'له' : '');

/**
 * Page-break rules (the table itself is unchanged):
 * - the table is cut in two: everything above the last TAIL_ROWS rows, and a tail that holds those rows, the
 *   totals row, the closing-balance bar and the notes as one block. So the bar and the notes are never alone on
 *   a page; in the all-tenants file such a page would be a blank page between two statements;
 * - the frame is open at the cut (no bottom border above it, no top border below it), so the two halves read as
 *   one table when they share a page;
 * - the gap under the table belongs to the block that follows it (margin-top), never to the table
 *   (margin-bottom): react-pdf counts a bottom margin as room the block still needs, so a table that fitted the
 *   page by less than 16pt used to be moved whole to the next page and left the rest of this one empty.
 */
export const TAIL_ROWS = 2;
export const FRAME_OPEN_BOTTOM = {
  borderBottomWidth: 0,
  borderBottomLeftRadius: 0,
  borderBottomRightRadius: 0,
  marginBottom: 0,
};
export const FRAME_OPEN_TOP = {
  borderTopWidth: 0,
  borderTopLeftRadius: 0,
  borderTopRightRadius: 0,
  marginBottom: 0,
};

function BalanceMoney({ value, bold }: { value: number; bold?: boolean }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <PdfReportMoney amount={Math.abs(value)} bold={bold} showZero color={value > 0.0005 ? PDF.danger : PDF.text} />
      {side(value) ? <Text style={{ fontSize: 6.5, color: PDF.muted, textAlign: 'center' }}>{ar(side(value))}</Text> : null}
    </View>
  );
}

export type TenantStatementPdfProps = {
  tenantName: string;
  shopNumber?: string | null;
  phone?: string | null;
  periodLabel: string;
  /** YYYY-MM-DD */
  issuedOn: string;
  statement: TenantStatement;
};

/** كشف حساب الإيجار: مستحق كل شهر، كل دفعة، والرصيد بعد كل حركة. */
export function TenantStatementPDF(props: TenantStatementPdfProps) {
  return (
    <Document title={`كشف حساب الإيجار - ${props.tenantName} - ${props.periodLabel}`} author={BRAND.fullName}>
      <TenantStatementPage {...props} />
    </Document>
  );
}

/** صفحات كشف مستأجر واحد — تُطبع وحدها أو ضمن كشوف كل المستأجرين. */
export function TenantStatementPage({ tenantName, shopNumber, phone, periodLabel, issuedOn, statement }: TenantStatementPdfProps) {
  const { rows, opening, totalDebit, totalCredit, closing, reconciliation: rec, year } = statement;

  const notes = [
    rec && Math.abs(rec.difference) > 0.0005
      ? { text: 'يوجد فرق في ربط بعض الدفعات بالأشهر — راجع ربط الإيصالات قبل اعتماد الكشف.', danger: true }
      : null,
    rec && rec.unlinked > 0.0005 ? { text: 'يشمل المدفوع مبالغ محصّلة لم تُربط بشهر محدد بعد.' } : null,
    { text: 'يُحتسب إيجار كل شهر في أول يوم منه. هذا الكشف لا يشمل التأمين ولا رسوم الخدمات.' },
  ].filter(Boolean);

  const statementRow = (r, i) => (
    <View key={r.key} style={[pdfReportTable.tableRow, i % 2 === 1 ? pdfReportTable.rowAlt : {}]} wrap={false}>
      <View style={[pdfReportTable.tdNum, { width: W.balance }]}>
        <BalanceMoney value={r.balance} />
      </View>
      <View style={[pdfReportTable.tdNum, { width: W.credit }]}>
        <PdfReportMoney amount={r.credit} color={PDF.success} />
      </View>
      <View style={[pdfReportTable.tdNum, { width: W.debit }]}>
        <PdfReportMoney amount={r.debit} />
      </View>
      <View style={{ width: W.desc }}>
        <Text style={pdfReportTable.tdAr}>{ar(r.label)}</Text>
        {r.detail ? <Text style={{ fontSize: 7, color: PDF.muted, textAlign: 'right', direction: 'rtl' }}>{ar(r.detail)}</Text> : null}
        {r.reference ? (
          <Text style={{ fontSize: 7, color: PDF.muted, textAlign: 'right' }}>
            {ar('مرجع: ')}
            <Text style={{ direction: 'ltr' }}>{r.reference}</Text>
          </Text>
        ) : null}
      </View>
      <View style={{ width: W.date, alignItems: 'center' }}>
        <Text style={{ fontSize: 8, color: PDF.text, textAlign: 'center' }}>{dateLabel(r.date)}</Text>
      </View>
    </View>
  );

  const openingRow =
    year != null ? (
      <View key="opening" style={[pdfReportTable.tableRow, pdfReportTable.rowAlt]} wrap={false}>
        <View style={[pdfReportTable.tdNum, { width: W.balance }]}>
          <BalanceMoney value={opening} bold />
        </View>
        <View style={{ width: W.credit }} />
        <View style={{ width: W.debit }} />
        <View style={{ width: W.desc }}>
          <Text style={[pdfReportTable.tdAr, { fontWeight: 'bold' }]}>{ar(`رصيد سابق (قبل ${year})`)}</Text>
        </View>
        <View style={{ width: W.date }} />
      </View>
    ) : null;
  const body = [openingRow, ...rows.map(statementRow)].filter(Boolean);
  const tailFrom = Math.max(0, body.length - TAIL_ROWS);

  const head = (
    <View style={pdfReportTable.tableHead} wrap={false} {...(tailFrom > 0 ? { fixed: true } : {})}>
      <Text style={[pdfReportTable.th, { width: W.balance }]}>{ar('الرصيد')}</Text>
      <Text style={[pdfReportTable.th, { width: W.credit }]}>{ar('مدفوع')}</Text>
      <Text style={[pdfReportTable.th, { width: W.debit }]}>{ar('مستحق')}</Text>
      <Text style={[pdfReportTable.thAr, { width: W.desc }]}>{ar('البيان')}</Text>
      <Text style={[pdfReportTable.th, { width: W.date }]}>{ar('التاريخ')}</Text>
    </View>
  );

  const totalsRow = (
    <View style={pdfReportTable.totalsRow} wrap={false}>
      <View style={[pdfReportTable.tdNum, { width: W.balance }]}>
        <BalanceMoney value={closing} bold />
      </View>
      <View style={[pdfReportTable.tdNum, { width: W.credit }]}>
        <PdfReportMoney amount={totalCredit} bold showZero />
      </View>
      <View style={[pdfReportTable.tdNum, { width: W.debit }]}>
        <PdfReportMoney amount={totalDebit} bold showZero />
      </View>
      <View style={{ width: W.desc }}>
        <Text style={pdfReportTable.totalsRowLabel}>{ar(`المجموع (${rows.length} حركة)`)}</Text>
      </View>
      <View style={{ width: W.date }} />
    </View>
  );

  return (
    <ReportPage
      title="كشف حساب الإيجار"
      titleEn="STATEMENT"
      subtitle={`${tenantName}${shopNumber ? ` · محل ${shopNumber}` : ''} · ${periodLabel}`}
      summaryPrimaryDateIso={issuedOn}
      summaryPrimaryDateLabel="تاريخ الكشف"
      metaCells={[
        { label: 'الإيجار المستحق', moneyAmount: totalDebit },
        { label: 'المدفوع', moneyAmount: totalCredit },
        { label: statementBalanceLabel(closing), moneyAmount: Math.abs(closing) },
      ]}
    >
      <View style={pdfReportTable.hero} wrap={false}>
        <View style={pdfReportTable.heroCell}>
          <Text style={pdfReportTable.heroLabel}>{ar('المستأجر')}</Text>
          <Text style={[pdfReportTable.heroValue, { direction: 'rtl' }]}>{ar(tenantName)}</Text>
        </View>
        <View style={pdfReportTable.heroCell}>
          <Text style={pdfReportTable.heroLabel}>{ar('المحل')}</Text>
          <Text style={pdfReportTable.heroValue}>{ar(shopNumber ? `محل ${shopNumber}` : '—')}</Text>
        </View>
        <View style={pdfReportTable.heroCell}>
          <Text style={pdfReportTable.heroLabel}>{ar('الهاتف')}</Text>
          <Text style={[pdfReportTable.heroValue, { direction: 'ltr' }]}>{phone || '—'}</Text>
        </View>
        <View style={pdfReportTable.heroCell}>
          <Text style={pdfReportTable.heroLabel}>{ar('الفترة')}</Text>
          <Text style={[pdfReportTable.heroValue, { direction: 'rtl' }]}>{ar(periodLabel)}</Text>
        </View>
      </View>

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

        <View style={[pdfReportTable.totalBar, { marginTop: 16 }]}>
          <View style={pdfReportTable.totalCluster}>
            <View style={pdfReportTable.totalMini}>
              <Text style={pdfReportTable.totalMiniLabel}>{ar(statementBalanceLabel(closing))}</Text>
              <PdfReportMoney amount={Math.abs(closing)} bold light showZero />
            </View>
          </View>
          <Text style={pdfReportTable.totalLabel}>{ar('الرصيد الختامي')}</Text>
        </View>

        {notes.map((n, i) => (
          <Text
            key={i}
            style={[pdfReportTable.caption, { marginTop: i === 0 ? 7 : 3, lineHeight: 1.35 }, n.danger ? { color: PDF.danger } : {}]}
          >
            {ar(n.text)}
          </Text>
        ))}
        <PdfReportCaption />
      </View>
    </ReportPage>
  );
}
