// @ts-nocheck
import React from 'react';
import { StyleSheet, Text, View } from '@react-pdf/renderer';
import { ReportShell } from './ReportShell';
import { ar } from './arabicPDF';
import { PDF } from './pdfBase';
import { pdfReportTable, PdfReportMoney, PdfReportCaption } from './pdfReportTable';
import { dayLabel, type DailyBox, type DailyLine, type DailyStatement } from '@/lib/daily-cashbox';

/*
 * Both captions below are worded so that no line repeats the same lam-alef ligature («لا» twice): react-pdf (textkit) drops all
 * but one of the repeats, and «أرقام هذا الكشف لا تطابق دفتر الخزينة … الاعتماد» printed without its «لا», saying the opposite.
 */

/** a caption is a sentence read right to left: react-pdf does not pass a direction down, so the text carries it (its closing full stop stays on the left) */
const caption = { ...pdfReportTable.caption, direction: 'rtl' as const };

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

/**
 * A box whose table has at most this many movements stays whole on one page. A longer one flows from where the previous box ends
 * (rows never split): keeping a longer box whole pushed it to the next page and left the page before it blank, a third of the
 * page at 6 movements and the first page worst of all.
 */
const KEEP_BOX_LINES = 3;

/**
 * The last box's table is cut in two, everything above its last TAIL_ROWS rows and a tail that holds those rows, the closing
 * row, the notes and the signatures as one block: a signature line is never alone on a page (a rule on a spacer in front of the
 * signatures only ever moved them to a new page by themselves). The frame is open at the cut, so the halves read as one table.
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
};

/** Room a breakable block needs below its start: title, column heads, the opening row and one movement. */
const BLOCK_START_ROOM = 150;

/** a titled block that stays whole on a page unless its table is long */
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
        {note ? <Text style={[caption, { marginTop: -4, marginBottom: 6 }]}>{ar(note)}</Text> : null}
        {children}
      </View>
    </>
  );
}

const money = (amount: number, extra = {}) => (
  <View style={pdfReportTable.tdNum}>
    <PdfReportMoney amount={amount} showZero {...extra} />
  </View>
);
const dash = () => <Text style={[pdfReportTable.td, { textAlign: 'center', color: PDF.muted }]}>{ar('—')}</Text>;
const text = (v: string, extra = {}) => <Text style={[pdfReportTable.tdAr, extra]}>{ar(v)}</Text>;
const small = (v: string) => <Text style={{ direction: 'rtl', fontSize: 7.5, color: PDF.muted, textAlign: 'right' }}>{ar(v)}</Text>;
const ref = (v: string | null) => (v ? <Text style={[pdfReportTable.td, { textAlign: 'center' }]}>{v}</Text> : dash());

const COLUMNS = [
  { label: 'الرصيد', width: '19%' },
  { label: 'صادر', width: '17%' },
  { label: 'وارد', width: '17%' },
  { label: 'البيان', width: '34%', text: true },
  { label: 'المرجع', width: '13%' },
];

function Row({ cells, alt, bold, keepWithNext }: { cells: React.ReactNode[]; alt?: boolean; bold?: boolean; keepWithNext?: boolean }) {
  return (
    <View
      style={[bold ? pdfReportTable.totalsRow : pdfReportTable.tableRow, alt ? pdfReportTable.rowAlt : {}]}
      wrap={false}
      {...(keepWithNext ? { minPresenceAhead: 40 } : {})}
    >
      {cells.map((cell, i) => (
        <View key={i} style={{ width: COLUMNS[i].width }}>
          {cell}
        </View>
      ))}
    </View>
  );
}

function BoxTable({ box, part = 'all' }: { box: DailyBox; part?: 'all' | 'top' | 'tail' }) {
  const incoming = (l: DailyLine) => l.kind === 'receipt' || l.kind === 'transfer_in';
  const label = (l: DailyLine) => {
    const side = l.kind === 'transfer_in' ? (l.counter ? `تحويل وارد من ${l.counter}` : 'تحويل وارد') : l.kind === 'transfer_out' ? (l.counter ? `تحويل صادر إلى ${l.counter}` : 'تحويل صادر') : KIND_LABEL[l.kind];
    return side;
  };
  const inTotal = box.receipts + box.transfersIn;
  const outTotal = box.payments + box.transfersOut;

  const head = (
    <View style={pdfReportTable.tableHead} wrap={false}>
      {COLUMNS.map((c) => (
        <Text key={c.label} style={[c.text ? pdfReportTable.thAr : pdfReportTable.th, { width: c.width }]}>
          {ar(c.label)}
        </Text>
      ))}
    </View>
  );
  const body = [
    <Row key="opening" cells={[money(box.opening, { bold: true }), dash(), dash(), text('الرصيد الافتتاحي', { fontWeight: 'bold' }), dash()]} />,
    ...box.lines.map((l, i) => (
      <Row
        key={l.id}
        alt={i % 2 === 0}
        // the closing balance row never stands alone at the top of a page (the cut table keeps it in its tail instead)
        keepWithNext={part === 'all' && i === box.lines.length - 1}
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
    )),
    ...(box.lines.length === 0 ? [<Row key="none" cells={[dash(), dash(), dash(), text('لا حركة في هذا اليوم'), dash()]} />] : []),
  ];
  const closing = <Row bold cells={[money(box.closing, { bold: true }), money(outTotal), money(inTotal), text('الرصيد الختامي', { fontWeight: 'bold' }), <View key="g" />]} />;
  const tailFrom = Math.max(0, body.length - TAIL_ROWS);

  if (part === 'top') {
    return (
      <View style={[pdfReportTable.tableWrap, FRAME_OPEN_BOTTOM]}>
        {head}
        {body.slice(0, tailFrom)}
      </View>
    );
  }
  if (part === 'tail') {
    return (
      <View style={[pdfReportTable.tableWrap, FRAME_OPEN_TOP]}>
        {body.slice(tailFrom)}
        {closing}
      </View>
    );
  }
  return (
    <View style={pdfReportTable.tableWrap}>
      {head}
      {body}
      {closing}
    </View>
  );
}

/** The cashier's handover sheet for one day: every box, every movement, balances that add up, three signatures. */
export function DailyCashboxPDF({ statement }: { statement: DailyStatement }) {
  const t = statement.totals;
  const closingBlock = (
    <>
      <Text style={caption}>{ar('القبض والصرف يستثنيان التحويلات بين الخزائن؛ أما أعمدة وارد وصادر في كل جدول فتشملها.')}</Text>
      {!statement.allReconcile ? <Text style={[caption, { color: PDF.danger }]}>{ar('تنبيه: أرقام هذا الكشف تخالف دفتر الخزينة، تجب مراجعته قبل اعتماده.')}</Text> : null}

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
    </>
  );
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
      {statement.boxes.map((box, index) => {
        const last = index === statement.boxes.length - 1;
        if (!last) {
          return (
            <Block key={box.id} title={box.name} keep={box.lines.length <= KEEP_BOX_LINES}>
              <BoxTable box={box} />
            </Block>
          );
        }
        // the last box keeps the notes and the signatures with the end of its table
        if (box.lines.length <= KEEP_BOX_LINES) {
          return (
            <View key={box.id} wrap={false}>
              <Text style={pdfReportTable.sectionTitle}>{ar(box.name)}</Text>
              <BoxTable box={box} />
              {closingBlock}
            </View>
          );
        }
        return (
          <React.Fragment key={box.id}>
            <Block title={box.name} keep={false}>
              <BoxTable box={box} part="top" />
            </Block>
            <View wrap={false}>
              <BoxTable box={box} part="tail" />
              {closingBlock}
            </View>
          </React.Fragment>
        );
      })}
      {statement.boxes.length === 0 ? <View wrap={false}>{closingBlock}</View> : null}
    </ReportShell>
  );
}
