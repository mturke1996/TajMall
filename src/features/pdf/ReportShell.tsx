// @ts-nocheck
import React from 'react';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import { registerPdfFonts } from './pdfFonts';
import { ar, arDate } from './arabicPDF';
import { pdfBase } from './pdfStyles';
import { BRAND, buildPdfFooterLine } from '@/lib/brand';

registerPdfFonts();

/**
 * Reusable PDF page shell — header (brand + report title), meta strip,
 * the report body (children) and a fixed footer with brand + page number.
 *
 * Every report in /app/(app)/reports/* renders inside this shell.
 */
export function ReportShell({
  title,
  subtitle,
  metaCells = [],
  children,
}: {
  title: string;
  subtitle?: string;
  metaCells?: { label: string; value: string }[];
  children: React.ReactNode;
}) {
  return (
    <Document title={`${BRAND.name} - ${title}`} author={BRAND.fullName} language="ar">
      <Page size="A4" style={pdfBase.page} wrap>
        {/* HEADER */}
        <View style={pdfBase.header} fixed>
          <View style={pdfBase.brandBox}>
            <Text style={pdfBase.monogram}>{ar(BRAND.monogram)}</Text>
            <View style={pdfBase.brandTexts}>
              <Text style={pdfBase.brandName}>{ar(BRAND.fullName)}</Text>
              <Text style={pdfBase.brandSub}>{ar(BRAND.tagline)}</Text>
            </View>
          </View>
          <View style={pdfBase.reportTitleBox}>
            <Text style={pdfBase.reportType}>{ar('تقرير')}</Text>
            <Text style={pdfBase.reportTitle}>{ar(title)}</Text>
            {subtitle ? <Text style={pdfBase.reportSub}>{ar(subtitle)}</Text> : null}
          </View>
        </View>

        {/* CONTACT STRIP */}
        <View style={pdfBase.contactLine} fixed>
          <Text style={pdfBase.contactText}>{ar(buildPdfFooterLine())}</Text>
        </View>

        {/* META */}
        {metaCells.length > 0 && (
          <View style={pdfBase.metaRow}>
            {metaCells.map((c, i) => (
              <View key={i} style={pdfBase.metaCell}>
                <Text style={pdfBase.metaLabel}>{ar(c.label)}</Text>
                <Text style={pdfBase.metaValue}>{ar(c.value)}</Text>
              </View>
            ))}
            <View style={pdfBase.metaCell}>
              <Text style={pdfBase.metaLabel}>{ar('تاريخ الإصدار')}</Text>
              <Text style={pdfBase.metaValue}>{arDate(new Date())}</Text>
            </View>
          </View>
        )}

        {/* BODY */}
        {children}

        {/* FOOTER */}
        <View style={pdfBase.footer} fixed>
          <Text style={pdfBase.footerBrand}>{ar(BRAND.fullName)}</Text>
          <Text style={pdfBase.footerText}>{ar(buildPdfFooterLine())}</Text>
        </View>
        <Text
          style={pdfBase.pageNumber}
          render={({ pageNumber, totalPages }) =>
            `${pageNumber} / ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  );
}
