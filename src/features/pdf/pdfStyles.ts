// @ts-nocheck
/**
 * Shared print-safe palette and base page styles for every PDF template.
 * Mirrors the in-app editorial design system but optimised for print.
 */

import { StyleSheet } from '@react-pdf/renderer';
import { PDF_FONT_FAMILY } from './pdfFonts';
import { BRAND } from '@/lib/brand';

export const PDF = BRAND.pdfPalette;

export const pdfBase = StyleSheet.create({
  page: {
    fontFamily: PDF_FONT_FAMILY,
    fontSize: 10,
    color: PDF.text,
    backgroundColor: '#FFFFFF',
    paddingTop: 36,
    paddingBottom: 60,
    paddingHorizontal: 38,
  },

  // ── Header ────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  brandBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  monogram: {
    width: 42,
    height: 42,
    backgroundColor: PDF.primary,
    color: '#FBF8F1',
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: 'bold',
    paddingTop: 8,
  },
  brandTexts: { alignItems: 'flex-start' },
  brandName: { fontSize: 13, fontWeight: 'bold', color: PDF.primary, marginBottom: 2 },
  brandSub: { fontSize: 9, color: PDF.muted },

  reportTitleBox: { alignItems: 'flex-end' },
  reportType: {
    fontSize: 8.5,
    color: PDF.muted,
    textTransform: 'uppercase',
        marginBottom: 2,
  },
  reportTitle: { fontSize: 15, fontWeight: 'bold', color: PDF.text },
  reportSub: { fontSize: 9, color: PDF.muted, marginTop: 2 },

  // ── Strip under the header ───────────────────────────────────────
  contactLine: {
    borderBottomWidth: 1,
    borderBottomColor: PDF.primary,
    paddingBottom: 6,
    marginBottom: 22,
    alignItems: 'flex-end',
  },
  contactText: { fontSize: 8.5, color: PDF.muted },

  // ── Meta strip (date / period / etc.) ────────────────────────────
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
    backgroundColor: PDF.rowAlt,
    borderWidth: 1,
    borderColor: PDF.border,
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  metaCell: { alignItems: 'flex-start' },
  metaLabel: { fontSize: 8, color: PDF.muted, marginBottom: 3 },
  metaValue: { fontSize: 10, fontWeight: 'bold', color: PDF.text },

  // ── Table ────────────────────────────────────────────────────────
  tableHead: {
    flexDirection: 'row',
    backgroundColor: PDF.headerBg,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 3,
  },
  th: {
    color: '#FBF8F1',
    fontSize: 9.5,
    fontWeight: 'bold',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: PDF.border,
  },
  rowEven: { backgroundColor: PDF.rowAlt },
  td: { fontSize: 10, color: PDF.text },
  tdMono: { fontSize: 10, color: PDF.text, fontFamily: PDF_FONT_FAMILY },
  tdMuted: { fontSize: 10, color: PDF.muted },

  // ── Totals row ───────────────────────────────────────────────────
  tableFoot: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: PDF.rowAlt,
    borderTopWidth: 1,
    borderTopColor: PDF.primary,
    marginTop: 4,
    borderRadius: 3,
  },
  footLabel: { fontSize: 11, fontWeight: 'bold', color: PDF.primary },
  footValue: { fontSize: 11, fontWeight: 'bold', color: PDF.text },

  // ── Footer ───────────────────────────────────────────────────────
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 38,
    right: 38,
    textAlign: 'center',
    borderTopWidth: 1,
    borderTopColor: PDF.border,
    paddingTop: 8,
  },
  footerBrand: { fontSize: 8.5, color: PDF.primary, fontWeight: 'bold', marginBottom: 2 },
  footerText: { fontSize: 7.5, color: PDF.muted },
  pageNumber: {
    position: 'absolute',
    bottom: 24,
    right: 38,
    fontSize: 8,
    color: PDF.muted,
  },
});
