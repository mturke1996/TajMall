// @ts-nocheck — react-pdf JSX styles
import React from 'react';
import { Page, Text, View } from '@react-pdf/renderer';
import { ar } from './arabicPDF';
import { pdfBase } from './pdfBase';
import { TajMallPdfFooter, PdfReportHeaderFlow } from './pdfBrandKit';

/**
 * رأس + تذييل + ترقيم — صفحة واحدة ضمن Document متعدد الصفحات.
 * مفصول عن ReportShell لتفادي أخطاء webpack/HMR عند التصدير المزدوج.
 */
export function ReportPageFrame({
  title,
  subtitle,
  titleEn = 'REPORT',
  children,
}: {
  title: string;
  subtitle?: string;
  titleEn?: string;
  children: React.ReactNode;
}) {
  return (
    <Page size="A4" style={pdfBase.page} wrap>
      <View style={pdfBase.pageAccentBar} fixed />
      <View style={pdfBase.pageFlow}>
        <PdfReportHeaderFlow title={title} subtitle={subtitle} titleEn={titleEn} />
        {children}
      </View>
      <TajMallPdfFooter fixed />
      <Text
        style={pdfBase.pageNumber}
        render={({ pageNumber, totalPages }) =>
          ar(`صفحة ${pageNumber ?? 1} من ${totalPages ?? 1}`)
        }
        fixed
      />
    </Page>
  );
}
