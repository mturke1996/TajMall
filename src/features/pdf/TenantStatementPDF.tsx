// @ts-nocheck
import React from 'react';
import { Text, View } from '@react-pdf/renderer';
import { ReportShell } from './ReportShell';
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
export function TenantStatementPDF({ tenantName, shopNumber, phone, periodLabel, issuedOn, statement }: TenantStatementPdfProps) {
  const { rows, opening, totalDebit, totalCredit, closing, reconciliation: rec, year } = statement;
  return (
    <ReportShell
      title="كشف حساب الإيجار"
      subtitle={`${tenantName}${shopNumber ? ` · محل ${shopNumber}` : ''} · ${periodLabel}`}
      documentTitle={`كشف حساب الإيجار - ${tenantName} - ${periodLabel}`}
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
          <Text style={pdfReportTable.heroValue}>{ar(tenantName)}</Text>
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
          <Text style={pdfReportTable.heroValue}>{ar(periodLabel)}</Text>
        </View>
      </View>

      <View style={pdfReportTable.tableWrap}>
        <View style={pdfReportTable.tableHead} wrap={false} fixed>
          <Text style={[pdfReportTable.th, { width: W.balance }]}>{ar('الرصيد')}</Text>
          <Text style={[pdfReportTable.th, { width: W.credit }]}>{ar('مدفوع')}</Text>
          <Text style={[pdfReportTable.th, { width: W.debit }]}>{ar('مستحق')}</Text>
          <Text style={[pdfReportTable.thAr, { width: W.desc }]}>{ar('البيان')}</Text>
          <Text style={[pdfReportTable.th, { width: W.date }]}>{ar('التاريخ')}</Text>
        </View>

        {year != null ? (
          <View style={[pdfReportTable.tableRow, pdfReportTable.rowAlt]} wrap={false}>
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
        ) : null}

        {rows.map((r, i) => (
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
              {r.detail ? <Text style={{ fontSize: 7, color: PDF.muted, textAlign: 'right' }}>{ar(r.detail)}</Text> : null}
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
        ))}

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
      </View>

      <View style={pdfReportTable.totalBar} wrap={false}>
        <View style={pdfReportTable.totalCluster}>
          <View style={pdfReportTable.totalMini}>
            <Text style={pdfReportTable.totalMiniLabel}>{ar(statementBalanceLabel(closing))}</Text>
            <PdfReportMoney amount={Math.abs(closing)} bold light showZero />
          </View>
        </View>
        <Text style={pdfReportTable.totalLabel}>{ar('الرصيد الختامي')}</Text>
      </View>

      {rec && Math.abs(rec.difference) > 0.0005 ? (
        <Text style={[pdfReportTable.caption, { color: PDF.danger }]}>
          {ar('يوجد فرق في ربط بعض الدفعات بالأشهر — راجع ربط الإيصالات قبل اعتماد الكشف.')}
        </Text>
      ) : null}
      {rec && rec.unlinked > 0.0005 ? (
        <Text style={pdfReportTable.caption}>
          {ar('يشمل المدفوع مبالغ محصّلة لم تُربط بشهر محدد بعد.')}
        </Text>
      ) : null}
      <Text style={pdfReportTable.caption}>
        {ar('يُحتسب إيجار كل شهر في أول يوم منه. هذا الكشف لا يشمل التأمين ولا رسوم الخدمات.')}
      </Text>
      <PdfReportCaption />
    </ReportShell>
  );
}
