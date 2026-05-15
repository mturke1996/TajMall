// @ts-nocheck
/**
 * Base PDF styles — منظومة تاج مول (التقارير والوثائق)
 * Core styling shared across all PDF reports
 *
 * الاتجاه: الصفحة `direction: 'rtl'` للنص؛ صف «ملخص الوثيقة» يستخدم `row-reverse` + `ltr`
 * لأن Yoga في react-pdf لا يعكس محور flex مع `direction: 'rtl'` كالمتصفح.
 */

import { PDF_FONT_FAMILY } from './pdfFonts';
import { BRAND } from '@/lib/brand';

const p = BRAND.pdfPalette;

/** ألوان التقارير — مصدر واحد من BRAND.pdfPalette */
export const PDF = {
  primary: p.primary,
  primaryLight: p.primaryLight,
  accent: p.accent,
  accentLight: p.accentLight,
  logoGreen: p.logoGreen,
  logoGreenSoft: p.logoGreenSoft,
  text: p.text,
  muted: p.muted,
  mutedBg: p.mutedBg,
  border: p.border,
  white: p.white,
  success: p.success,
  warning: p.warning,
  danger: p.danger,
  info: p.info,
  headerBg: p.headerBg,
  rowAlt: p.rowAlt,
  paleGold: p.paleGold,
};

export const pdfBase = {
  page: {
    direction: 'rtl',
    fontFamily: PDF_FONT_FAMILY,
    fontSize: 9,
    color: PDF.text,
    backgroundColor: PDF.white,
    paddingTop: 28,
    paddingBottom: 48,
    paddingHorizontal: 36,
  },

  pageAccentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: PDF.primary,
  },

  /**
   * الرأس: شريط بارتفاع محجوز فيه كتلتان مثبتتان بإحداثيات صريحة.
   *   - brandBoxFixed   → ثابت على يمين الورقة (الشعار + الاسم)
   *   - titleBoxAtLeft  → ثابت على يسار الورقة (نوع التقرير + العنوان)
   * بهذا لا يتلامس النصّان مهما طال أحدهما.
   */
  header: {
    position: 'relative',
    width: '100%',
    minHeight: 68,
    marginBottom: 16,
    paddingBottom: 14,
    paddingTop: 4,
    borderBottomWidth: 1,
    borderBottomColor: PDF.border,
  },

  /** عنوان التقرير — مثبَّت على الحافة اليسرى للورقة، النص أيضاً يُحاذى لليسار */
  titleBoxAtLeft: {
    position: 'absolute',
    left: 0,
    top: 4,
    direction: 'rtl',
    alignItems: 'flex-start',
    maxWidth: '44%',
  },

  /** الهوية ثابتة على الحافة اليمنى للورقة */
  brandBoxFixed: {
    position: 'absolute',
    right: 0,
    top: 4,
    direction: 'rtl',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    maxWidth: '48%',
  },

  brandTexts: {
    alignItems: 'flex-end',
  },

  monogram: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: PDF.primary,
    color: PDF.white,
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: 44,
  },

  brandName: {
    fontSize: 11.5,
    fontWeight: 'bold',
    color: PDF.primary,
    letterSpacing: 0.15,
    textAlign: 'right',
  },

  brandSub: {
    fontSize: 8,
    color: PDF.muted,
    marginTop: 3,
    lineHeight: 1.45,
    textAlign: 'right',
  },

  /** قديم — لم يعد مستخدماً مباشرة، أُبقي للأمان مع التراث */
  reportTitleBox: {
    alignItems: 'flex-start',
  },

  /** ترويسة فوق العنوان — مكتوبة بحروف عربية لكن محاذاة لليسار */
  reportType: {
    fontSize: 7.5,
    color: PDF.logoGreen,
    alignSelf: 'flex-start',
    paddingBottom: 3,
    marginBottom: 6,
    letterSpacing: 1.2,
    fontWeight: 'bold',
    textAlign: 'left',
    borderBottomWidth: 1.5,
    borderBottomColor: PDF.logoGreen,
  },

  reportTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: PDF.primary,
    textAlign: 'left',
    letterSpacing: 0.2,
    lineHeight: 1.3,
  },

  reportSub: {
    fontSize: 9,
    color: PDF.muted,
    marginTop: 4,
    textAlign: 'left',
    lineHeight: 1.45,
  },

  contactLine: {
    backgroundColor: PDF.mutedBg,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginBottom: 10,
    borderRadius: 3,
  },

  contactText: {
    fontSize: 7.5,
    color: PDF.muted,
    textAlign: 'center',
  },

  /**
   * بطاقة ملخص فاخرة: شريط داكن في الأعلى، ثم صف خلايا — أولها التاريخ بطباعة كبيرة،
   * ثم باقي القيم مفصولة بخطوط رأسية رفيعة بدون حدود حول كل خلية (طراز كشوف البنوك).
   */
  luxe: {
    marginBottom: 18,
    borderWidth: 1,
    borderColor: PDF.primary,
    backgroundColor: PDF.white,
  },

  /** شريط العنوان: صراحةً من اليمين (العنوان) إلى اليسار (تلميح العلامة) — Yoga لا يعكس flex مثل المتصفح */
  luxeRibbon: {
    backgroundColor: PDF.primary,
    paddingVertical: 6,
    paddingHorizontal: 14,
    flexDirection: 'row-reverse',
    direction: 'ltr',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  luxeRibbonText: {
    fontSize: 7.5,
    color: '#ffffff',
    fontWeight: 'bold',
    letterSpacing: 1.4,
    textAlign: 'right',
  },

  luxeRibbonHint: {
    fontSize: 7,
    color: '#ffffff',
    opacity: 0.7,
    fontWeight: 'normal',
    letterSpacing: 0.6,
    textAlign: 'left',
  },

  /** صف الملخص: أول عنصر في JSX = خلية التاريخ → تُرسَم يمين الورقة، ثم الفواصل والخلايا نحو اليسار */
  luxeRow: {
    direction: 'ltr',
    flexDirection: 'row-reverse',
    alignItems: 'stretch',
  },

  /** الخلية الرئيسية للتاريخ — أوسع قليلاً وبخلفية عاجية ناعمة */
  luxeDateCell: {
    direction: 'rtl',
    flex: 1.55,
    paddingVertical: 18,
    paddingHorizontal: 20,
    backgroundColor: PDF.rowAlt,
    justifyContent: 'center',
  },

  /** خلية قيمة عادية */
  luxeCell: {
    direction: 'rtl',
    flex: 1,
    paddingVertical: 18,
    paddingHorizontal: 18,
    justifyContent: 'center',
  },

  /** فاصل عمودي شعري بين الخلايا */
  luxeDivider: {
    width: 1,
    backgroundColor: PDF.border,
  },

  luxeEyebrow: {
    fontSize: 7.5,
    color: PDF.muted,
    fontWeight: 'bold',
    letterSpacing: 1.1,
    marginBottom: 12,
    textAlign: 'right',
  },

  /** كتلة التاريخ: رقم يوم ضخم + اسم الشهر/السنة بجانبه */
  luxeDateBlock: {
    direction: 'rtl',
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },

  luxeDay: {
    fontSize: 36,
    fontWeight: 'bold',
    color: PDF.primary,
    lineHeight: 1,
    textAlign: 'right',
  },

  luxeDateTexts: {
    alignItems: 'flex-end',
    paddingBottom: 5,
  },

  luxeMonthYear: {
    fontSize: 11.5,
    fontWeight: 'bold',
    color: PDF.text,
    textAlign: 'right',
    lineHeight: 1.25,
  },

  luxeWeekday: {
    fontSize: 8.5,
    color: PDF.logoGreen,
    fontWeight: 'bold',
    marginTop: 3,
    letterSpacing: 0.4,
    textAlign: 'right',
  },

  luxeGregorian: {
    fontSize: 8.5,
    color: PDF.muted,
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: PDF.border,
    letterSpacing: 0.8,
    textAlign: 'right',
  },

  luxeValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: PDF.primary,
    textAlign: 'right',
    letterSpacing: 0.2,
    lineHeight: 1.15,
  },

  /** صف عملة + رقم — LTR؛ العملة أيسر والمبلغ على يمينها؛ المحتوى يُحاذى يمين الخلية */
  luxeMoneyRow: {
    width: '100%',
    flexDirection: 'row',
    direction: 'ltr',
    alignItems: 'baseline',
    justifyContent: 'flex-end',
    gap: 6,
  },

  luxeMoneyCurrency: {
    fontSize: 13,
    fontWeight: 'bold',
    color: PDF.primary,
    letterSpacing: 0.2,
  },

  luxeValueSub: {
    fontSize: 8,
    color: PDF.muted,
    marginTop: 6,
    textAlign: 'right',
    letterSpacing: 0.4,
  },

  tableHead: {
    direction: 'rtl',
    flexDirection: 'row',
    backgroundColor: PDF.headerBg,
    paddingVertical: 8,
    paddingHorizontal: 9,
    marginBottom: 2,
    borderBottomWidth: 1,
    borderBottomColor: PDF.border,
  },

  th: {
    color: PDF.white,
    fontSize: 9,
    fontWeight: 'bold',
    textAlign: 'right',
  },

  tableRow: {
    direction: 'rtl',
    flexDirection: 'row',
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: PDF.border,
    alignItems: 'center',
  },

  rowEven: {
    backgroundColor: PDF.rowAlt,
  },

  tableFoot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: PDF.logoGreenSoft,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderTopWidth: 1.5,
    borderTopColor: PDF.primary,
    marginTop: 2,
  },

  footLabel: {
    fontSize: 9,
    fontWeight: 'bold',
    color: PDF.logoGreen,
    textAlign: 'right',
  },

  footValue: {
    fontSize: 9,
    fontWeight: 'bold',
    color: PDF.text,
    textAlign: 'left',
  },

  td: {
    fontSize: 9,
    color: PDF.text,
    textAlign: 'right',
  },

  tdMuted: {
    fontSize: 9,
    color: PDF.muted,
    textAlign: 'center',
    paddingVertical: 12,
  },

  tdBold: {
    fontSize: 9,
    fontWeight: 'bold',
    color: PDF.text,
    textAlign: 'right',
  },

  tdNum: {
    fontSize: 9,
    color: PDF.text,
    textAlign: 'center',
  },

  footer: {
    position: 'absolute',
    bottom: 18,
    left: 32,
    right: 32,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 0.5,
    borderTopColor: PDF.border,
    paddingTop: 6,
  },

  footerBrand: {
    fontSize: 8,
    fontWeight: 'bold',
    color: PDF.primary,
  },

  footerText: {
    fontSize: 7.5,
    color: PDF.muted,
  },

  /** أعلى يمين الصفحة — بعيد عن التذييل، متوافق مع RTL */
  pageNumber: {
    position: 'absolute',
    top: 11,
    right: 28,
    width: 120,
    textAlign: 'right',
    fontSize: 7,
    color: PDF.muted,
    fontWeight: 'bold',
    lineHeight: 1.25,
  },

  sectionTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: PDF.primary,
    marginBottom: 8,
    marginTop: 16,
    paddingBottom: 5,
    paddingRight: 6,
    borderBottomWidth: 1.5,
    borderBottomColor: PDF.logoGreen,
    letterSpacing: 0.2,
    textAlign: 'right',
  },

  caption: {
    fontSize: 8,
    color: PDF.muted,
    marginTop: 12,
    textAlign: 'center',
  },

  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    fontSize: 7.5,
    fontWeight: 'bold',
  },

  badgeSuccess: {
    backgroundColor: '#dcfce7',
    color: PDF.success,
  },

  badgeWarning: {
    backgroundColor: '#fef9c3',
    color: '#854d0e',
  },

  badgeDanger: {
    backgroundColor: '#fee2e2',
    color: PDF.danger,
  },

  badgeInfo: {
    backgroundColor: '#dbeafe',
    color: '#1e40af',
  },
};
