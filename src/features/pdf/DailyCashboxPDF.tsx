// @ts-nocheck
import React from 'react';
import { StyleSheet, Text, View } from '@react-pdf/renderer';
import { ReportShell } from './ReportShell';
import { ar } from './arabicPDF';
import { PDF } from './pdfBase';
import { pdfReportTable, PdfReportMoney, PdfReportCaption } from './pdfReportTable';
import { dayLabel, type DailyBox, type DailyLine, type DailyStatement } from '@/lib/daily-cashbox';

const KIND_LABEL: Record<DailyLine['kind'], string> = {
  receipt: 'قبض',
  payment: 'صرف',
  transfer_in: 'تحويل وارد',
  transfer_out: 'تحويل صادر',
};

const s = StyleSheet.create({
  sign: { marginTop: 34, flexDirection: 'row-reverse', justifyContent: 'space-between' },
  signBox: { width: '30%', borderTopWidth: 0.8, borderTopColor: PDF.border, paddingTop: 5 },
  signText: { fontSize: 8, color: PDF.muted, textAlign: 'center' },
});

/** a titled block that stays whole on a page unless its table is long */
function Block({ title, note, keep = true, children }: { title: string; note?: string; keep?: boolean; children: React.ReactNode }) {
  return (
    <View wrap={!keep}>
      <Text style={pdfReportTable.sectionTitle} minPresenceAhead={90}>
        {ar(title)}
      </Text>
      {note ? <Text style={[pdfReportTable.caption, { marginTop: -4, marginBottom: 6 }]}>{ar(note)}</Text> : null}
      {children}
    </View>
  );
}

const money = (amount: number, extra = {}) => (
  <View style={pdfReportTable.tdNum}>
    <PdfReportMoney amount={amount} showZero {...extra} />
  </View>
);
const dash = () => <Text style={[pdfReportTable.td, { textAlign: 'center', color: PDF.muted }]}>{ar('—')}</Text>;
const text = (v: string, extra = {}) => <Text style={[pdfReportTable.tdAr, extra]}>{ar(v)}</Text>;
const small = (v: string) => <Text style={{ fontSize: 7.5, color: PDF.muted, textAlign: 'right' }}>{ar(v)}</Text>;
const ref = (v: string | null) => (v ? <Text style={[pdfReportTable.td, { textAlign: 'center' }]}>{v}</Text> : dash());

const COLUMNS = [
  { label: 'الرصيد', width: '19%' },
  { label: 'صادر', width: '17%' },
  { label: 'وارد', width: '17%' },
  { label: 'البيان', width: '34%', text: true },
  { label: 'المرجع', width: '13%' },
];

function Row({ cells, alt, bold }: { cells: React.ReactNode[]; alt?: boolean; bold?: boolean }) {
  return (
    <View style={[bold ? pdfReportTable.totalsRow : pdfReportTable.tableRow, alt ? pdfReportTable.rowAlt : {}]} wrap={false}>
      {cells.map((cell, i) => (
        <View key={i} style={{ width: COLUMNS[i].width }}>
          {cell}
        </View>
      ))}
    </View>
  );
}

function BoxTable({ box }: { box: DailyBox }) {
  const incoming = (l: DailyLine) => l.kind === 'receipt' || l.kind === 'transfer_in';
  const label = (l: DailyLine) => {
    const side = l.kind === 'transfer_in' ? (l.counter ? `تحويل وارد من ${l.counter}` : 'تحويل وارد') : l.kind === 'transfer_out' ? (l.counter ? `تحويل صادر إلى ${l.counter}` : 'تحويل صادر') : KIND_LABEL[l.kind];
    return side;
  };
  const inTotal = box.receipts + box.transfersIn;
  const outTotal = box.payments + box.transfersOut;
  return (
    <View style={pdfReportTable.tableWrap}>
      <View style={pdfReportTable.tableHead} wrap={false}>
        {COLUMNS.map((c) => (
          <Text key={c.label} style={[c.text ? pdfReportTable.thAr : pdfReportTable.th, { width: c.width }]}>
            {ar(c.label)}
          </Text>
        ))}
      </View>
      <Row cells={[money(box.opening, { bold: true }), dash(), dash(), text('الرصيد الافتتاحي', { fontWeight: 'bold' }), dash()]} />
      {box.lines.map((l, i) => (
        <Row
          key={l.id}
          alt={i % 2 === 0}
          cells={[
            money(l.balanceAfter),
            incoming(l) ? dash() : money(l.amount),
            incoming(l) ? money(l.amount) : dash(),
            <View key="d">
              {text(l.description ?? label(l))}
              {small(l.description ? label(l) : '')}
            </View>,
            ref(l.ref),
          ]}
        />
      ))}
      {box.lines.length === 0 ? <Row cells={[dash(), dash(), dash(), text('لا حركة في هذا اليوم'), dash()]} /> : null}
      <Row bold cells={[money(box.closing, { bold: true }), money(outTotal), money(inTotal), text('الرصيد الختامي', { fontWeight: 'bold' }), <View key="g" />]} />
    </View>
  );
}

/** The cashier's handover sheet for one day: every box, every movement, balances that add up, three signatures. */
export function DailyCashboxPDF({ statement }: { statement: DailyStatement }) {
  const t = statement.totals;
  return (
    <ReportShell
      title="كشف الخزائن اليومي"
      subtitle={dayLabel(statement.date)}
      documentTitle={`كشف الخزائن اليومي - ${dayLabel(statement.date)}`}
      summaryPrimaryDateIso={statement.date}
      summaryPrimaryDateLabel="تاريخ الكشف"
      metaCells={[
        { label: 'الافتتاحي', moneyAmount: t.opening },
        { label: 'القبض', moneyAmount: t.receipts },
        { label: 'الصرف', moneyAmount: t.payments },
        { label: 'الختامي', moneyAmount: t.closing },
      ]}
    >
      {statement.boxes.map((box) => (
        <Block key={box.id} title={box.name} keep={box.lines.length <= 12}>
          <BoxTable box={box} />
        </Block>
      ))}

      <Text style={pdfReportTable.caption}>{ar('القبض والصرف لا يشملان التحويلات بين الخزائن؛ أما أعمدة وارد وصادر في كل جدول فتشملها.')}</Text>
      {!statement.allReconcile ? <Text style={[pdfReportTable.caption, { color: PDF.danger }]}>{ar('تنبيه: أرقام هذا الكشف لا تطابق دفتر الخزينة، يُراجع قبل الاعتماد.')}</Text> : null}

      {/* the signatures and the closing line move together, and never into the footer */}
      <View minPresenceAhead={150} />
      <View wrap={false}>
        <View style={s.sign}>
          <View style={s.signBox}>
            <Text style={s.signText}>{ar('أمين الخزينة')}</Text>
          </View>
          <View style={s.signBox}>
            <Text style={s.signText}>{ar('المحاسب')}</Text>
          </View>
          <View style={s.signBox}>
            <Text style={s.signText}>{ar('المدير')}</Text>
          </View>
        </View>
        <PdfReportCaption />
      </View>
    </ReportShell>
  );
}
