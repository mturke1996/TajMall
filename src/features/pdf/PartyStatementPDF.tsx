// @ts-nocheck — react-pdf JSX styles; runtime-validated by rendering the document
import React from 'react';
import { Document, Text, View } from '@react-pdf/renderer';
import { ReportPage } from './ReportShell';
import { BRAND } from '@/lib/brand';
import { ar } from './arabicPDF';
import { PDF } from './pdfBase';
import { arabicCount } from '@/lib/utils';
import { pdfReportTable, PdfReportMoney, PdfReportCaption } from './pdfReportTable';
import type { Statement } from '@/lib/people/party-profile';

const W = { balance: '17%', paid: '15%', received: '15%', desc: '39%', date: '14%' };

/**
 * Page-break rules (the table itself is unchanged): the table is cut in two, everything above the last TAIL_ROWS rows and
 * a tail holding those rows, the totals row, the net bar and the notes as one block, so the bar and the notes are never alone
 * on a page. The frame is open at the cut, so the two halves read as one table when they share a page. The gap under the
 * table belongs to the block that follows it (margin-top): react-pdf counts a bottom margin as room the block still needs.
 */
const TAIL_ROWS = 2;
const FRAME_OPEN_BOTTOM = {
  borderBottomWidth: 0,
  borderBottomLeftRadius: 0,
  borderBottomRightRadius: 0,
  marginBottom: 0,
};
const FRAME_OPEN_TOP = {
  borderTopWidth: 0,
  borderTopLeftRadius: 0,
  borderTopRightRadius: 0,
  marginBottom: 0,
};

const dateLabel = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

/** received minus paid: positive is money that came in, negative is money that went out */
const sideWord = (n: number) => (n > 0.0005 ? 'مقبوض' : n < -0.0005 ? 'مدفوع' : '');

function NetMoney({ value, bold }: { value: number; bold?: boolean }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <PdfReportMoney amount={Math.abs(value)} bold={bold} showZero />
      {sideWord(value) ? <Text style={{ fontSize: 6.5, color: PDF.muted, textAlign: 'center' }}>{ar(sideWord(value))}</Text> : null}
    </View>
  );
}

export type PartyStatementPdfProps = {
  name: string;
  code?: string | null;
  phone?: string | null;
  /** «مورد», «عميل», «مؤجر للمول»…: what the contact is to the mall */
  roleLabel: string;
  /** YYYY-MM-DD */
  issuedOn: string;
  statement: Statement;
};

const periodText = (s: Statement) => (s.from && s.to ? `${dateLabel(s.from)} إلى ${dateLabel(s.to)}` : '—');

/** كشف حساب جهة: كل حركة محتسبة بتاريخها وما قُبض منها أو دُفع لها، والصافي التراكمي بعد كل حركة. */
export function PartyStatementPDF(props: PartyStatementPdfProps) {
  return (
    <Document title={`كشف حساب - ${props.name}`} author={BRAND.fullName}>
      <PartyStatementPage {...props} />
    </Document>
  );
}

export function PartyStatementPage({ name, code, phone, roleLabel, issuedOn, statement }: PartyStatementPdfProps) {
  const { rows, totalReceived, totalPaid, net } = statement;
  const netWord = net > 0.0005 ? 'صافي المقبوض' : net < -0.0005 ? 'صافي المدفوع' : 'الصافي';
  const body = rows.map((r, i) => (
    <View key={r.id} style={[pdfReportTable.tableRow, i % 2 === 1 ? pdfReportTable.rowAlt : {}]} wrap={false}>
      <View style={[pdfReportTable.tdNum, { width: W.balance }]}>
        <NetMoney value={r.net} />
      </View>
      <View style={[pdfReportTable.tdNum, { width: W.paid }]}>
        <PdfReportMoney amount={r.paid} color={PDF.danger} />
      </View>
      <View style={[pdfReportTable.tdNum, { width: W.received }]}>
        <PdfReportMoney amount={r.received} color={PDF.success} />
      </View>
      <View style={{ width: W.desc }}>
        <Text style={pdfReportTable.tdAr}>{ar(r.description || r.account || 'بدون بيان')}</Text>
        {r.description && r.account ? <Text style={{ fontSize: 7, color: PDF.muted, textAlign: 'right' }}>{ar(r.account)}</Text> : null}
        {r.number != null ? (
          <Text style={{ fontSize: 7, color: PDF.muted, textAlign: 'right' }}>
            {ar('رقم المعاملة: ')}
            <Text style={{ direction: 'ltr' }}>{String(r.number)}</Text>
          </Text>
        ) : null}
      </View>
      <View style={{ width: W.date, alignItems: 'center' }}>
        <Text style={{ fontSize: 8, color: PDF.text, textAlign: 'center' }}>{dateLabel(r.date)}</Text>
      </View>
    </View>
  ));
  const tailFrom = Math.max(0, body.length - TAIL_ROWS);

  const head = (
    <View style={pdfReportTable.tableHead} wrap={false} fixed>
      <Text style={[pdfReportTable.th, { width: W.balance }]}>{ar('الصافي التراكمي')}</Text>
      <Text style={[pdfReportTable.th, { width: W.paid }]}>{ar('مدفوع')}</Text>
      <Text style={[pdfReportTable.th, { width: W.received }]}>{ar('مقبوض')}</Text>
      <Text style={[pdfReportTable.thAr, { width: W.desc }]}>{ar('البيان')}</Text>
      <Text style={[pdfReportTable.th, { width: W.date }]}>{ar('التاريخ')}</Text>
    </View>
  );

  const totalsRow = (
    <View style={pdfReportTable.totalsRow} wrap={false}>
      <View style={[pdfReportTable.tdNum, { width: W.balance }]}>
        <NetMoney value={net} bold />
      </View>
      <View style={[pdfReportTable.tdNum, { width: W.paid }]}>
        <PdfReportMoney amount={totalPaid} bold showZero />
      </View>
      <View style={[pdfReportTable.tdNum, { width: W.received }]}>
        <PdfReportMoney amount={totalReceived} bold showZero />
      </View>
      <View style={{ width: W.desc }}>
        <Text style={pdfReportTable.totalsRowLabel}>{ar(`المجموع (${arabicCount(rows.length, ['حركة واحدة', 'حركتان', 'حركات', 'حركة'])})`)}</Text>
      </View>
      <View style={{ width: W.date }} />
    </View>
  );

  return (
    <ReportPage
      title="كشف حساب"
      titleEn="STATEMENT"
      subtitle={`${name} · ${roleLabel}`}
      summaryPrimaryDateIso={issuedOn}
      summaryPrimaryDateLabel="تاريخ الكشف"
      metaCells={[
        { label: 'المقبوض', moneyAmount: totalReceived },
        { label: 'المدفوع', moneyAmount: totalPaid },
        { label: netWord, moneyAmount: Math.abs(net) },
      ]}
    >
      <View style={pdfReportTable.hero} wrap={false}>
        <View style={pdfReportTable.heroCell}>
          <Text style={pdfReportTable.heroLabel}>{ar('الجهة')}</Text>
          <Text style={pdfReportTable.heroValue}>{ar(name)}</Text>
        </View>
        <View style={pdfReportTable.heroCell}>
          <Text style={pdfReportTable.heroLabel}>{ar('الصفة')}</Text>
          <Text style={pdfReportTable.heroValue}>{ar(roleLabel)}</Text>
        </View>
        <View style={pdfReportTable.heroCell}>
          <Text style={pdfReportTable.heroLabel}>{ar('الرمز والهاتف')}</Text>
          <Text style={[pdfReportTable.heroValue, { direction: 'ltr' }]}>{[code, phone].filter(Boolean).join('  ·  ') || '—'}</Text>
        </View>
        <View style={pdfReportTable.heroCell}>
          <Text style={pdfReportTable.heroLabel}>{ar('الفترة')}</Text>
          <Text style={[pdfReportTable.heroValue, { direction: 'ltr' }]}>{periodText(statement)}</Text>
        </View>
      </View>

      {rows.length === 0 ? (
        <>
          <View style={pdfReportTable.tableWrap}>
            {head}
            <View style={{ padding: 18 }}>
              <Text style={{ fontSize: 9, color: PDF.muted, textAlign: 'center' }}>{ar('لا توجد حركات محتسبة لهذه الجهة.')}</Text>
            </View>
          </View>
          <Text style={pdfReportTable.caption}>{ar('يشمل الكشف الحركات المرحّلة والمطابَقة فقط. المسودات والملغاة غير محتسبة.')}</Text>
          <PdfReportCaption />
        </>
      ) : (
        <>
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

            <View style={[pdfReportTable.totalBar, { marginTop: 20 }]}>
              <View style={pdfReportTable.totalCluster}>
                <View style={pdfReportTable.totalMini}>
                  <PdfReportMoney amount={Math.abs(net)} bold light showZero />
                </View>
              </View>
              <Text style={pdfReportTable.totalLabel}>{ar(netWord)}</Text>
            </View>

            <Text style={pdfReportTable.caption}>{ar('يشمل الكشف الحركات المرحّلة والمطابَقة فقط. المسودات والملغاة غير محتسبة.')}</Text>
            <PdfReportCaption />
          </View>
        </>
      )}
    </ReportPage>
  );
}
