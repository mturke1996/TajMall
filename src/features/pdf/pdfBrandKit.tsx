'use client';

import React from "react";
import { View, Text, StyleSheet, Image } from "@react-pdf/renderer";
import { PDF_FONT_FAMILY } from "./pdfFonts";
import { ar } from "./arabicPDF";
import { BRAND, buildPdfFooterLine } from "@/lib/brand";
import { PDF_PAGINATION } from "./pdfBase";
import { usePdfLogoDataUri } from "./pdf-logo-context";
import {
  pdfFormatAmountRaw,
  pdfFormatMoneyLtr,
  PdfMoneyText as PdfMoneyTextImpl,
  PDF_CURRENCY_AR,
} from "./pdfMoney";

const bp = BRAND.pdfPalette;

/** لوحة ألوان PDF — متماثلة مع الهوية في brand.ts */
export const PDFPalette = {
  primary: bp.primary,
  primaryLight: bp.primaryLight,
  accent: bp.accent,
  accentLight: bp.accentLight,
  logoGreen: bp.logoGreen,
  logoGreenSoft: bp.logoGreenSoft,
  white: bp.white,
  rowAlt: bp.rowAlt,
  paleGold: bp.paleGold,
  headerBg: bp.headerBg,
  mutedBg: bp.mutedBg,
  text: bp.text,
  muted: bp.muted,
  whiteText: "#ffffff",
  border: bp.border,
  borderDark: "#d5d3cd",
  success: bp.success,
  warning: bp.warning,
  danger: bp.danger,
  info: bp.info,
};

export const LIBYAN_CURRENCY_LABEL = "د.ل";

// ============================================================
// Styles
// ============================================================
export const pdfBrandStyles = StyleSheet.create({
  page: {
    fontFamily: PDF_FONT_FAMILY,
    fontSize: 9,
    color: PDFPalette.text,
    backgroundColor: PDFPalette.white,
    paddingTop: PDF_PAGINATION.headerReserve,
    paddingBottom: PDF_PAGINATION.footerReserve,
    paddingHorizontal: 36,
  },

  // Header Styles
  headerShell: {
    position: "relative",
    width: "100%",
    minHeight: 76,
    marginBottom: 12,
  },

  identityAbsolute: {
    position: "absolute",
    right: 0,
    top: 0,
    direction: "rtl",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    maxWidth: "56%",
  },

  headerTitleCol: {
    alignItems: "flex-end",
    justifyContent: "flex-start",
    maxWidth: "44%",
    paddingTop: 8,
    direction: "rtl",
  },
  titleEn: {
    fontSize: 26,
    fontWeight: "bold",
    color: "#a3a3a3",
        marginBottom: 4,
    textAlign: "right",
  },
  titleAr: { 
    fontSize: 11, 
    fontWeight: "bold", 
    color: PDFPalette.primary,
    textAlign: "right",
  },

  logoWrap: {
    paddingRight: 4,
    alignItems: "center",
    justifyContent: "center",
  },

  identityText: {
    alignItems: "flex-end",
    flexShrink: 1,
    maxWidth: 300,
    justifyContent: "center",
  },
  companyFull: {
    fontSize: 13.5,
    fontWeight: "bold",
    color: PDFPalette.primary,
    marginBottom: 3,
    textAlign: "right",
    lineHeight: 1.35,
      },
  engineer: {
    fontSize: 10,
    fontWeight: "bold",
    color: PDFPalette.accent,
    marginBottom: 2,
    textAlign: "right",
  },
  tagEn: {
    fontSize: 8,
    fontWeight: "bold",
    color: PDFPalette.muted,
    textAlign: "right",
      },

  divider: {
    borderBottomWidth: 2,
    borderBottomColor: PDFPalette.logoGreen,
    paddingBottom: 8,
    marginBottom: 14,
  },

  contactBlock: {
    alignItems: "flex-end",
  },
  contactRowSingle: {
    flexDirection: "row",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    marginBottom: 3,
  },
  contactLine: {
    fontSize: 8.8,
    fontWeight: "bold",
    color: PDFPalette.muted,
    textAlign: "right",
    lineHeight: 1.45,
  },

  kvRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    marginTop: 4,
    paddingTop: 5,
    borderTopWidth: 1,
    borderTopColor: PDFPalette.border,
  },
  kvBox: {
    width: "32%",
    alignItems: "flex-end",
  },
  kvLabel: {
    fontSize: 7,
    fontWeight: "bold",
    color: PDFPalette.logoGreen,
    marginBottom: 2,
    textAlign: "right",
  },
  kvVal: {
    fontSize: 8.8,
    fontWeight: "bold",
    color: PDFPalette.text,
    textAlign: "right",
  },

  servicesRow: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopStyle: "dashed",
    borderTopColor: PDFPalette.border,
    alignItems: "flex-end",
  },
  servicesLabel: {
    fontSize: 7,
    fontWeight: "bold",
    color: PDFPalette.logoGreen,
    marginBottom: 3,
    textAlign: "right",
  },
  servicesText: {
    fontSize: 8,
    color: PDFPalette.text,
    textAlign: "right",
    lineHeight: 1.55,
  },

  // Footer — كتلة display:block مثبتة أسفل الصفحة (منفصلة عن الجسم)
  footer: {
    position: "absolute",
    bottom: PDF_PAGINATION.footerBottom,
    left: 36,
    right: 36,
    borderTopWidth: 1,
    borderTopColor: PDFPalette.border,
    paddingTop: 5,
    paddingBottom: 2,
  },
  footerInner: {
    width: "100%",
    flexDirection: "column",
    alignItems: "center",
  },
  footerBrand: {
    fontSize: 9.5,
    fontWeight: "bold",
    color: PDFPalette.primary,
    marginBottom: 2,
  },
  footerEng: {
    fontSize: 8.5,
    fontWeight: "bold",
    color: PDFPalette.accent,
    marginBottom: 3,
  },
  footerMuted: {
    fontSize: 7.8,
    color: PDFPalette.muted,
    lineHeight: 1.4,
    marginBottom: 2,
  },
  footerNote: { 
    fontSize: 6.8, 
    color: PDFPalette.muted,
  },

  // Client Info Styles
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  datesCol: { 
    width: "38%" 
  },
  dateRow: { 
    flexDirection: "row", 
    justifyContent: "space-between", 
    marginBottom: 8 
  },
  dateLabel: { 
    fontSize: 8.8, 
    color: "#999", 
    textAlign: "right" 
  },
  dateVal: { 
    fontSize: 8.8, 
    fontWeight: "bold", 
    color: PDFPalette.text, 
    textAlign: "left" 
  },

  clientBox: {
    width: "55%",
    paddingVertical: 4,
    paddingRight: 12,
    borderRightWidth: 2,
    borderRightColor: PDFPalette.primary,
    alignItems: "flex-end",
  },
  clientSectionLbl: {
    fontSize: 7.5,
    fontWeight: "bold",
    color: PDFPalette.accent,
    marginBottom: 3,
    textAlign: "right",
  },
  clientName: {
    fontSize: 12.5,
    fontWeight: "bold",
    color: PDFPalette.text,
    textAlign: "right",
    marginBottom: 2,
  },
  clientSub: { 
    fontSize: 8.8, 
    color: "#888", 
    marginTop: 2, 
    textAlign: "right" 
  },

  // Section Styles
  sectionTitle: {
    fontSize: 10.5,
    fontWeight: "bold",
    color: PDFPalette.primary,
    marginBottom: 6,
    marginTop: 12,
    paddingBottom: 4,
    borderBottomWidth: 1.5,
    borderBottomColor: PDFPalette.border,
    textAlign: "right",
  },

  // Summary Card Styles
  summaryRow: { 
    flexDirection: "row", 
    gap: 10, 
    marginBottom: 14 
  },
  summaryCard: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: PDFPalette.rowAlt,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: PDFPalette.border,
    alignItems: "center",
  },
  summaryLabel: {
    fontSize: 8.2,
    color: PDFPalette.muted,
    marginBottom: 5,
    fontWeight: "bold",
    textAlign: "center",
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: "bold",
    color: PDFPalette.primary,
    textAlign: "center",
  },
  summaryCurr: {
    fontSize: 9,
    color: PDFPalette.muted,
    fontWeight: "bold",
    marginRight: 2,
  },

  // Table Styles
  tableHead: {
    flexDirection: "row",
    backgroundColor: PDFPalette.headerBg,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 3,
    marginBottom: 2,
  },
  th: {
    color: PDFPalette.whiteText,
    fontSize: 9,
    fontWeight: "bold",
    textAlign: "right",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f0efeb",
  },
  rowEven: { 
    backgroundColor: PDFPalette.rowAlt 
  },

  td: { 
    fontSize: 9, 
    color: PDFPalette.text, 
    textAlign: "right" 
  },
  tdBold: { 
    fontSize: 9, 
    fontWeight: "bold", 
    color: PDFPalette.text, 
    textAlign: "right" 
  },
  tdPos: { 
    fontSize: 9, 
    fontWeight: "bold", 
    color: PDFPalette.success, 
    textAlign: "right" 
  },
  tdNeg: { 
    fontSize: 9, 
    fontWeight: "bold", 
    color: PDFPalette.danger, 
    textAlign: "right" 
  },

  totalRow: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: PDFPalette.mutedBg,
    borderTopWidth: 1.5,
    borderTopColor: PDFPalette.primary,
    marginTop: 1,
    borderRadius: 2,
  },

  grandBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    marginTop: 10,
    borderTopWidth: 1.5,
    borderTopColor: PDFPalette.primary,
  },
  grandLbl: {
    fontSize: 11,
    fontWeight: "bold",
    color: PDFPalette.primary,
    textAlign: "right",
  },
  grandAmt: {
    fontSize: 13,
    fontWeight: "bold",
    color: PDFPalette.primary,
    textAlign: "left",
  },

  totalsBox: { 
    width: 240, 
    alignSelf: "flex-start", 
    marginTop: 10 
  },
  totalLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },

  // Notes Box
  notesBox: {
    padding: 10,
    backgroundColor: PDFPalette.paleGold,
    borderRightWidth: 3,
    borderRightColor: PDFPalette.accentLight,
    borderRadius: 3,
    marginTop: 14,
    alignItems: "flex-end",
  },
  notesLbl: {
    fontSize: 9,
    fontWeight: "bold",
    color: PDFPalette.accent,
    marginBottom: 4,
    textAlign: "right",
  },
  notesTxt: { 
    fontSize: 9.5, 
    color: "#555", 
    textAlign: "right", 
    lineHeight: 1.65 
  },
});

// ============================================================
// Logo — يُفضَّل src مضمَّناً كـ data URI (prepareTajMallPdfTree قبل التصدير)
// ============================================================
function PdfLogoFallback({ size }: { size: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: PDFPalette.primary,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: "#fff", fontSize: size * 0.38, fontWeight: "bold" }}>
        {BRAND.monogram}
      </Text>
    </View>
  );
}

export const PdfLogoMark = ({ size = 64 }: { size?: number }) => {
  const injected = usePdfLogoDataUri();
  if (injected) {
    return (
      <View style={[pdfBrandStyles.logoWrap, { width: size, height: size }]}>
        {/* @react-pdf Image ليس وسم img في المتصفح */}
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <Image src={injected} style={{ width: size, height: size, objectFit: "contain" }} />
      </View>
    );
  }
  return <PdfLogoFallback size={size} />;
};

// ============================================================
// Helper Functions
// ============================================================
export function pdfFmtNum(n: number): string {
  return pdfFormatAmountRaw(n);
}

export function pdfFmtDate(iso?: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(
      2,
      "0"
    )}/${d.getFullYear()}`;
  } catch {
    return iso;
  }
}

export function pdfFmtMoneyLibyan(n: number): string {
  return pdfFormatMoneyLtr(n, LIBYAN_CURRENCY_LABEL || PDF_CURRENCY_AR);
}

/**
 * مبلغ بترتيب ثابت: الرقم ثم «د.ل» — انظر pdfMoney.tsx
 * (currStyle مُتجاهَل؛ الإبقاء للتوافق مع الاستدعاءات القديمة)
 */
export const PdfMoneyText = ({
  amount,
  style,
  currStyle,
  containerStyle,
  currency,
  align,
  color,
  light,
  adaptive,
  adaptiveBase,
}: {
  amount: number;
  style?: any;
  currStyle?: any;
  containerStyle?: any;
  currency?: string;
  align?: 'left' | 'center' | 'right';
  color?: string;
  light?: boolean;
  adaptive?: boolean;
  adaptiveBase?: number;
}) => (
  <PdfMoneyTextImpl
    amount={amount}
    style={style}
    currStyle={currStyle}
    containerStyle={containerStyle}
    currency={currency ?? LIBYAN_CURRENCY_LABEL}
    align={align}
    color={color}
    light={light}
    adaptive={adaptive}
    adaptiveBase={adaptiveBase}
  />
);

// ============================================================
// Footer Component
// ============================================================
export const TajMallPdfFooter = ({
  companyName = BRAND.fullName,
  tagline = BRAND.tagline,
  footerNote = 'وثيقة داخلية للاستخدام الإداري — لا تُعتمد أمام الغير دون توثيق رسمي. يُعتد بالنسخ المختومة فقط.',
  fixed = true,
}: {
  companyName?: string;
  tagline?: string;
  footerNote?: string;
  fixed?: boolean;
}) => {
  const strip = buildPdfFooterLine();
  const block = (
    <View style={pdfBrandStyles.footerInner}>
      <Text style={pdfBrandStyles.footerBrand}>{ar(companyName)}</Text>
      <Text style={pdfBrandStyles.footerEng}>{ar(tagline)}</Text>
      {strip ? <Text style={pdfBrandStyles.footerMuted}>{ar(strip)}</Text> : null}
      <Text style={pdfBrandStyles.footerNote}>{ar(footerNote)}</Text>
    </View>
  );

  if (fixed) {
    return (
      <View style={pdfBrandStyles.footer} fixed>
        {block}
      </View>
    );
  }

  return (
    <View style={[pdfBrandStyles.footer, { position: 'relative', bottom: 0, left: 0, right: 0 }]}>
      {block}
    </View>
  );
};

// ============================================================
// Header Component
// ============================================================
type HeaderProps = { 
  titleEn: string; 
  subtitleAr: string; 
  refLine?: string;
  companyInfo?: {
    name: string;
    tagline: string;
    address: string;
    phones: string[];
    services: string[];
  };
};

export const TajMallPdfHeader = ({ 
  titleEn, 
  subtitleAr, 
  refLine,
  companyInfo = {
    name: BRAND.fullName,
    tagline: BRAND.tagline,
    address: BRAND.contact.address,
    phones: [BRAND.contact.phone, BRAND.contact.phone2].filter(Boolean),
    services: [
      "إدارة الإيرادات والمصروفات",
      "دفتر يومية مزدوج",
      "تقارير مالية وخزائن",
    ],
  },
}: HeaderProps) => (
  <View wrap={false}>
    <View style={pdfBrandStyles.headerShell}>
      <View style={pdfBrandStyles.identityAbsolute}>
        <View style={pdfBrandStyles.identityText}>
          <Text style={pdfBrandStyles.companyFull}>{ar(companyInfo.name)}</Text>
          <Text style={pdfBrandStyles.tagEn}>{ar(companyInfo.tagline)}</Text>
        </View>
        <PdfLogoMark size={68} />
      </View>

      <View style={pdfBrandStyles.headerTitleCol}>
        <Text style={pdfBrandStyles.titleEn}>{titleEn}</Text>
        <Text style={pdfBrandStyles.titleAr}>{ar(subtitleAr)}</Text>
        {refLine ? (
          <Text
            style={[
              pdfBrandStyles.titleAr,
              { marginTop: 4, fontSize: 9.5, color: PDFPalette.muted },
            ]}
          >
            {ar(refLine)}
          </Text>
        ) : null}
      </View>
    </View>

    <View style={pdfBrandStyles.divider}>
      <View style={pdfBrandStyles.contactBlock}>
        <View style={pdfBrandStyles.kvRow}>
          <View style={[pdfBrandStyles.kvBox, { width: "55%" }]}>
            <Text style={pdfBrandStyles.kvLabel}>{ar('العنوان')}</Text>
            <Text style={pdfBrandStyles.kvVal}>{ar(companyInfo.address)}</Text>
          </View>
          <View style={[pdfBrandStyles.kvBox, { width: "40%" }]}>
            <Text style={pdfBrandStyles.kvLabel}>{ar('الهاتف')}</Text>
            <Text style={pdfBrandStyles.kvVal}>
              {companyInfo.phones.length
                ? ar(companyInfo.phones.join("\n"))
                : ar('—')}
            </Text>
          </View>
        </View>
      </View>

      {companyInfo.services.length ? (
        <View style={pdfBrandStyles.servicesRow}>
          <Text style={pdfBrandStyles.servicesLabel}>{ar('مجالات الخدمة')}</Text>
          <Text style={pdfBrandStyles.servicesText}>
            {ar(companyInfo.services.join("   •   "))}
          </Text>
        </View>
      ) : null}
    </View>
  </View>
);
