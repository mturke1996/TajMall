// @ts-nocheck
import React from 'react';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import { ar, arDateParts } from './arabicPDF';
import { pdfBase } from './pdfBase';
import { TajMallPdfFooter, TajMallPdfHeader, PdfLogoMark, pdfFmtNum } from './pdfBrandKit';
import { BRAND } from '@/lib/brand';

/**
 * خلية في ملخص الوثيقة.
 * — استخدم `moneyAmount` لعرض **العملة يسار المبلغ** (صف LTR صريح داخل خلية rtl).
 * — أو `value` لنص عادي؛ `valueDirection: 'ltr'` اختياري للنصوص المختلطة.
 */
export type ReportShellMetaCell = {
  label: string;
  value?: string;
  moneyAmount?: number;
  currency?: string;
  valueDirection?: 'ltr' | 'rtl';
};

/**
 * هيكل صفحة PDF احترافي للتقارير المالية.
 *
 * - الشعار + الاسم: مثبَّتان بإحداثيات صريحة على يمين الورقة.
 * - عنوان التقرير: مثبَّت على يسار الورقة، النص يبدأ من الحافة اليسرى تماماً.
 * - بطاقة ملخص الوثيقة: شريط داكن علوي + خلية تاريخ كبيرة + خلايا KPI مفصولة بخطوط شعرية.
 * - يمكن تمرير `summaryPrimaryDateIso` لعرض **تاريخ الإذن/التقرير** في الخلية الكبرى بدل تاريخ اليوم فقط.
 */
export function ReportShell({
  title,
  subtitle,
  metaCells = [],
  /** إن وُجد، تُستخدم الخلية الكبرى في الملخص لهذا التاريخ (مثل تاريخ إذن الصرف) بدل تاريخ اليوم */
  summaryPrimaryDateIso,
  /** تسمية الخلية الكبرى — الافتراضي: تاريخ إصدار الوثيقة */
  summaryPrimaryDateLabel,
  children,
  showFooter = true,
  showHeader = true,
  headerProps,
}: {
  title: string;
  subtitle?: string;
  metaCells?: ReportShellMetaCell[];
  summaryPrimaryDateIso?: string;
  summaryPrimaryDateLabel?: string;
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
  const summaryDate =
    summaryPrimaryDateIso != null && summaryPrimaryDateIso.trim() !== ''
      ? new Date(
          summaryPrimaryDateIso.includes('T')
            ? summaryPrimaryDateIso
            : `${summaryPrimaryDateIso.slice(0, 10)}T12:00:00`,
        )
      : null;
  const dateParts = arDateParts(
    summaryDate && !Number.isNaN(summaryDate.getTime()) ? summaryDate : new Date(),
  );
  const luxeBigDateLabel = summaryPrimaryDateLabel ?? 'تاريخ إصدار الوثيقة';

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
          <TajMallPdfHeader
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
              {/* خلية التاريخ — يمين بطاقة الملخص (row-reverse في pdfBase.luxeRow) */}
              <View style={pdfBase.luxeDateCell}>
                <Text style={pdfBase.luxeEyebrow}>{ar(luxeBigDateLabel)}</Text>
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
                  {c.moneyAmount != null && Number.isFinite(c.moneyAmount) ? (
                    <View wrap={false} style={pdfBase.luxeMoneyRow}>
                      <Text style={pdfBase.luxeMoneyCurrency}>
                        {ar(c.currency ?? 'د.ل')}
                      </Text>
                      <Text style={pdfBase.luxeValue}>{pdfFmtNum(c.moneyAmount)}</Text>
                    </View>
                  ) : (
                    <Text
                      style={[
                        pdfBase.luxeValue,
                        c.valueDirection === 'ltr' && {
                          direction: 'ltr',
                          textAlign: 'left',
                        },
                      ]}
                    >
                      {ar(c.value ?? '')}
                    </Text>
                  )}
                </View>,
              ])}
            </View>
          </View>
        )}

        {/* BODY */}
        {children}

        {/* FOOTER */}
        {showFooter && <TajMallPdfFooter />}

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
