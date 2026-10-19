/**
 * PeriodJournalExecutivePDF with the optional blocks of the options dialog added at the end of its page flow:
 * the line that says which filters were applied, who printed the report and when, and the «أعدّه / اعتمده»
 * lines. The report itself (its tables, strips and totals) is not touched: this component calls it, then
 * appends to its content. With no extras it returns exactly what the report returns.
 *
 * PeriodJournalExecutivePDF is a plain function component (no hooks), so calling it gives its element tree;
 * the content column is found by its style object (`pdfBase.pageFlow`), the one the report uses for it.
 */
import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { View } from '@react-pdf/renderer';
import { PeriodJournalExecutivePDF, type PeriodJournalExecutivePdfProps } from '../PeriodJournalExecutivePDF';
import { pdfBase } from '../pdfBase';
import { PdfPrintLine, PdfScopeNote, PdfSignatureBlock } from './PdfReportExtras';

export type JournalExecutiveExtras = {
  /** «التصفية: الجهة: …», empty when nothing is filtered */
  scopeNote?: string;
  printedBy?: string;
  printedAt?: string;
  signature?: boolean;
};

export type JournalExecutiveDocumentProps = PeriodJournalExecutivePdfProps & { extras?: JournalExecutiveExtras };

type AnyElement = ReactElement<{ style?: unknown; children?: ReactNode }>;

/** Appends `extra` to the children of the page flow, wherever it sits in the tree. Returns null when it is not there. */
function appendToFlow(node: ReactNode, extra: ReactNode): ReactNode | null {
  if (!isValidElement(node)) return null;
  const el = node as AnyElement;
  const kids = Children.toArray(el.props.children);
  if (el.props.style === pdfBase.pageFlow) {
    return cloneElement(el, undefined, ...kids, extra);
  }
  for (let i = 0; i < kids.length; i += 1) {
    const replaced = appendToFlow(kids[i], extra);
    if (replaced) {
      const next: ReactNode[] = [...kids];
      next[i] = replaced;
      return cloneElement(el, undefined, ...next);
    }
  }
  return null;
}

export function JournalExecutiveDocument({ extras, ...report }: JournalExecutiveDocumentProps) {
  const doc = PeriodJournalExecutivePDF(report) as ReactElement;
  const { scopeNote, printedBy, printedAt, signature } = extras ?? {};
  if (!scopeNote && !printedBy && !printedAt && !signature) return doc;

  // one block that moves to the next page as a whole, so the print line is never alone on a page without its signature lines
  const block = (
    <View wrap={false} key="journal-extras">
      {scopeNote ? <PdfScopeNote text={scopeNote} /> : null}
      <PdfPrintLine printedBy={printedBy} printedAt={printedAt} />
      {signature ? <PdfSignatureBlock preparedBy={printedBy} /> : null}
    </View>
  );
  return (appendToFlow(doc, block) as ReactElement | null) ?? doc;
}
