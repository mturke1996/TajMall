import { BRAND } from '@/lib/brand';

export type ReportPdfExportNames = {
  fileName: string;
  shareTitle: string;
  shareText: string;
  documentTitle: string;
};

/** بادئة العلامة — ASCII فقط لتوافق واتساب وiOS */
export function pdfBrandFilePrefix(): string {
  return (BRAND.nameLatin || 'Taj Mall').toLowerCase().replace(/\s+/g, '-');
}

/** جزء اسم ملف: أحرف لاتينية وأرقام وشرطات فقط */
export function asciiFileSlug(part: string): string {
  return part
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** يبني اسم ملف PDF بدون امتداد — آمن للمشاركة على كل الأجهزة */
export function buildPdfFileName(...parts: (string | undefined | null)[]): string {
  const segments = [pdfBrandFilePrefix(), ...parts.map((p) => (p ? asciiFileSlug(p) : ''))]
    .filter(Boolean)
    .join('-');
  return segments || 'taj-mall-report';
}

/** تسميات واضحة لتقارير المحاسبة عند التحميل والمشاركة */
export function formatAccountingReportExportNames(input: {
  /** للعرض في المشاركة والوثيقة */
  reportKindAr: string;
  /** للاسم الإنجليزي للملف — مثل trial-balance */
  reportKindEn: string;
  periodLabel: string;
  /** للاسم الإنجليزي للملف — مثل fy-2026 أو 2026-07 */
  periodSlugEn: string;
  extraFileSlug?: string;
  statsLine?: string;
  balanced?: boolean;
}): ReportPdfExportNames {
  const fileName = buildPdfFileName(
    input.reportKindEn,
    input.periodSlugEn,
    input.extraFileSlug,
  );

  const shareTitle = `${input.reportKindAr} — ${input.periodLabel} · ${BRAND.name}`;
  const balanceNote =
    input.balanced === false ? '\nتنبيه: التقرير يحتاج مراجعة محاسبية.' : '';
  const shareText = [
    `${input.reportKindAr} للفترة: ${input.periodLabel}.${balanceNote}`,
    input.statsLine,
    `${BRAND.fullName} — ${BRAND.tagline}`,
  ]
    .filter(Boolean)
    .join('\n');

  const documentTitle = `${BRAND.name} — ${input.reportKindAr} — ${input.periodLabel}`;

  return { fileName, shareTitle, shareText, documentTitle };
}
