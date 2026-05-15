// @ts-nocheck
import React from 'react';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import { ar, arDateParts } from './arabicPDF';
import { pdfBase } from './pdfBase';
import { FluxenPdfFooter, FluxenPdfHeader, PdfLogoMark } from './pdfBrandKit';
import { BRAND } from '@/lib/brand';

/**
 * هيكل صفحة PDF احترافي للتقارير المالية.
 *
 * - الشعار + الاسم: مثبَّتان بإحداثيات صريحة على يمين الورقة.
 * - عنوان التقرير: مثبَّت على يسار الورقة، النص يبدأ من الحافة اليسرى تماماً.
 * - بطاقة ملخص الوثيقة: شريط داكن علوي + خلية تاريخ كبيرة + خلايا KPI مفصولة بخطوط شعرية.
 */
export function ReportShell({
  title,
  subtitle,
  metaCells = [],
  children,
  showFooter = true,
  showHeader = true,
  headerProps,
}: {
  title: string;
  subtitle?: string;
  metaCells?: { label: string; value: string }[];
  children: React.ReactNode;
  showFooter?: boolean;
  showHeader?: boolean;
  headerProps?: {
    titleEn?: string;
    subtitleAr?: string;
    refLine?: string;
    companyInfo?: any;
  };
}) {
  const dateParts = arDateParts(new Date());

  return (
    <Document title={`${BRAND.name} - ${title}`} author={BRAND.fullName}>
      <Page size="A4" style={pdfBase.page} wrap>
        <View style={pdfBase.pageAccentBar} fixed />

        {/* HEADER — كتلتان مثبتتان لا تتلامسان */}
        {showHeader && (
          <View style={pdfBase.header} fixed>
            <View style={pdfBase.titleBoxAtLeft} wrap={false}>
              <Text style={pdfBase.reportType}>{ar('تقرير')}</Text>
              <Text style={pdfBase.reportTitle}>{ar(title)}</Text>
              {subtitle ? <Text style={pdfBase.reportSub}>{ar(subtitle)}</Text> : null}
            </View>
            <View style={pdfBase.brandBoxFixed} wrap={false}>
              <View style={pdfBase.brandTexts}>
                <Text style={pdfBase.brandName}>{ar(BRAND.fullName)}</Text>
                <Text style={pdfBase.brandSub}>{ar(BRAND.tagline)}</Text>
              </View>
              <PdfLogoMark size={52} />
            </View>
          </View>
        )}

        {/* Alternative Full Header */}
        {headerProps && (
          <FluxenPdfHeader
            titleEn={headerProps.titleEn || title}
            subtitleAr={headerProps.subtitleAr || subtitle || ''}
            refLine={headerProps.refLine}
            companyInfo={headerProps.companyInfo}
          />
        )}

        {/* بطاقة الملخص الفاخرة */}
        {metaCells.length > 0 && (
          <View style={pdfBase.luxe} wrap={false}>
            <View style={pdfBase.luxeRibbon}>
              <Text style={pdfBase.luxeRibbonText}>{ar('ملخّص الوثيقة')}</Text>
              <Text style={pdfBase.luxeRibbonHint}>{ar(BRAND.fullName)}</Text>
            </View>

            <View style={pdfBase.luxeRow}>
              {/* خلية التاريخ — أول الخلايا (يمين الورقة في RTL) */}
              <View style={pdfBase.luxeDateCell}>
                <Text style={pdfBase.luxeEyebrow}>{ar('تاريخ إصدار الوثيقة')}</Text>
                <View style={pdfBase.luxeDateBlock}>
                  <Text style={pdfBase.luxeDay}>{dateParts.day}</Text>
                  <View style={pdfBase.luxeDateTexts}>
                    <Text style={pdfBase.luxeMonthYear}>{ar(dateParts.monthYear)}</Text>
                    <Text style={pdfBase.luxeWeekday}>{ar(dateParts.weekday)}</Text>
                  </View>
                </View>
                <Text style={pdfBase.luxeGregorian}>
                  {ar(`ميلادي · ${dateParts.gregorian}`)}
                </Text>
              </View>

              {/* خلايا الـ KPI، يفصل بينها خط شعري رأسي */}
              {metaCells.flatMap((c, i) => [
                <View key={`luxe-div-${i}`} style={pdfBase.luxeDivider} />,
                <View key={`luxe-cell-${i}`} style={pdfBase.luxeCell}>
                  <Text style={pdfBase.luxeEyebrow}>{ar(c.label)}</Text>
                  <Text style={pdfBase.luxeValue}>{ar(c.value)}</Text>
                </View>,
              ])}
            </View>
          </View>
        )}

        {/* BODY */}
        {children}

        {/* FOOTER */}
        {showFooter && <FluxenPdfFooter />}

        {/* Page Number */}
        <Text
          style={pdfBase.pageNumber}
          render={({ pageNumber, totalPages }) =>
            ar(`صفحة ${pageNumber ?? 1} من ${totalPages ?? 1}`)
          }
          fixed
        />
      </Page>
    </Document>
  );
}
