// @ts-nocheck

import React from 'react';

import { Document, Page, Text, View } from '@react-pdf/renderer';

import { ar, arDateParts } from './arabicPDF';

import { pdfBase, PDF, PDF_PAGINATION } from './pdfBase';

import { TajMallPdfFooter, TajMallPdfHeader, PdfLogoMark, PdfMoneyText } from './pdfBrandKit';

import { BRAND } from '@/lib/brand';



/**

 * خلية في ملخص الوثيقة.

 * — استخدم `moneyAmount` لعرض **المبلغ ثم العملة** (صف LTR صريح؛ يمنع انقلاب الإجمالي).

 * — أو `value` لنص عادي؛ `valueDirection: 'ltr'` اختياري للنصوص المختلطة.

 */

export type ReportShellMetaCell = {

  label: string;

  value?: string;

  moneyAmount?: number;

  currency?: string;

  valueDirection?: 'ltr' | 'rtl';

  /** تصغير خط المبلغ تلقائياً عند كبر الرقم */
  adaptiveMoney?: boolean;

};



/** يُستبدل بخلية التاريخ عند تمرير فترة (ربع / نصف / سنة) */
export type ReportShellPeriodSummary = {

  eyebrow: string;

  title: string;

  subtitle: string;

  hint: string;

  badge?: string;

};



/**

 * هيكل صفحة PDF احترافي للتقارير المالية.

 *

 * - الرأس والتذييل مثبّتان (fixed) — الجسم في كتلة pageFlow منفصلة.

 * - paddingBottom للصفحة = footerReserve فقط (بدون فراغ زائد فوق التذييل).

 */

export function ReportShell({

  title,

  subtitle,

  metaCells = [],

  periodSummary,

  summaryPrimaryDateIso,

  summaryPrimaryDateLabel,

  children,

  showFooter = true,

  showHeader = true,

  showSummary = true,

  headerProps,

  /** عنوان ملف PDF الداخلي (يظهر في قارئ PDF والمشاركة) */
  documentTitle,

}: {

  title: string;

  subtitle?: string;

  metaCells?: ReportShellMetaCell[];

  periodSummary?: ReportShellPeriodSummary;

  summaryPrimaryDateIso?: string;

  summaryPrimaryDateLabel?: string;

  children: React.ReactNode;

  showFooter?: boolean;

  showHeader?: boolean;

  showSummary?: boolean;

  headerProps?: {

    titleEn?: string;

    subtitleAr?: string;

    refLine?: string;

    companyInfo?: any;

  };

  documentTitle?: string;

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

    <Document title={documentTitle ?? `${BRAND.name} - ${title}`} author={BRAND.fullName}>

      <Page
        size="A4"
        style={[
          pdfBase.page,
          !showHeader && { paddingTop: PDF_PAGINATION.headerCompact },
        ]}
        wrap
      >

        <View style={pdfBase.pageAccentBar} fixed />



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

              <PdfLogoMark size={56} />

            </View>

          </View>

        )}



        {headerProps && (

          <TajMallPdfHeader

            titleEn={headerProps.titleEn || title}

            subtitleAr={headerProps.subtitleAr || subtitle || ''}

            refLine={headerProps.refLine}

            companyInfo={headerProps.companyInfo}

          />

        )}



        {/* جسم الصفحة — كتلة مستقلة عن التذييل */}

        <View style={pdfBase.pageFlow}>

          {showSummary && metaCells.length > 0 && (

            <View style={pdfBase.luxe} wrap={false}>

              <View style={pdfBase.luxeRibbon}>

                <Text style={pdfBase.luxeRibbonText}>{ar('ملخّص الوثيقة')}</Text>

                <Text style={pdfBase.luxeRibbonHint}>{ar(BRAND.fullName)}</Text>

              </View>



              <View style={pdfBase.luxeRow}>

                <View style={pdfBase.luxeDateCell}>

                  {periodSummary ? (

                    <>

                      <Text style={pdfBase.luxeEyebrow}>{ar(periodSummary.eyebrow)}</Text>

                      {periodSummary.badge ? (

                        <View

                          style={{

                            alignSelf: 'flex-end',

                            backgroundColor: PDF.logoGreen,

                            paddingVertical: 3,

                            paddingHorizontal: 8,

                            borderRadius: 3,

                            marginBottom: 8,

                          }}

                        >

                          <Text

                            style={{

                              fontSize: 7.5,

                              fontWeight: 'bold',

                              color: '#fff',

                              textAlign: 'right',

                            }}

                          >

                            {ar(periodSummary.badge)}

                          </Text>

                        </View>

                      ) : null}

                      <Text style={pdfBase.luxeMonthYear}>{ar(periodSummary.title)}</Text>

                      <Text style={[pdfBase.luxeWeekday, { marginTop: 4 }]}>

                        {ar(periodSummary.subtitle)}

                      </Text>

                      <Text style={pdfBase.luxeGregorian}>{ar(periodSummary.hint)}</Text>

                    </>

                  ) : (

                    <>

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

                    </>

                  )}

                </View>



                {metaCells.flatMap((c, i) => [

                  <View key={`luxe-div-${i}`} style={pdfBase.luxeDivider} />,

                  <View key={`luxe-cell-${i}`} style={pdfBase.luxeCell}>

                    <Text style={pdfBase.luxeEyebrow}>{ar(c.label)}</Text>

                    {c.moneyAmount != null && Number.isFinite(c.moneyAmount) ? (

                      <PdfMoneyText

                        amount={c.moneyAmount}

                        currency={c.currency ?? 'د.ل'}

                        align="right"

                        adaptive={c.adaptiveMoney !== false}

                        adaptiveBase={15}

                        style={pdfBase.luxeValue}

                        currStyle={pdfBase.luxeMoneyCurrency}

                        containerStyle={{ justifyContent: 'flex-start', maxWidth: '100%' }}

                      />

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



          {children}

        </View>



        {showFooter && <TajMallPdfFooter fixed />}



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


