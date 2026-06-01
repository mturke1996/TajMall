/**
 * قوالب قيود يومية — أكواد من migrations (013) و constants (EXP/REV).
 * يدعم fallback_codes عند اختلاف التسمية في قاعدة البيانات.
 */

export type JournalTemplateLine = {
  category_code: string;
  fallback_codes?: string[];
  side: 'debit' | 'credit';
  share?: number;
  fixed_amount?: number;
  description?: string;
};

export type JournalTemplate = {
  id: string;
  label: string;
  description: string;
  default_description: string;
  category: 'مول' | 'إيراد' | 'مصروف' | 'عام';
  lines: JournalTemplateLine[];
  requires_total_amount?: boolean;
};

export const JOURNAL_TEMPLATE_CATEGORIES = [
  { id: 'all', label: 'الكل' },
  { id: 'مول', label: 'المول' },
  { id: 'إيراد', label: 'إيرادات' },
  { id: 'مصروف', label: 'مصروفات' },
  { id: 'عام', label: 'عام' },
] as const;

export const JOURNAL_TEMPLATES: JournalTemplate[] = [
  {
    id: 'rent-accrual',
    label: 'استحقاق إيجار',
    description: 'ذمم مستأجرين ← إيراد إيجارات',
    category: 'مول',
    default_description: 'استحقاق إيجارات الشهر',
    requires_total_amount: true,
    lines: [
      { category_code: 'AST-REC', side: 'debit', share: 1 },
      { category_code: 'REV-RNT', side: 'credit', share: 1 },
    ],
  },
  {
    id: 'rent-collection',
    label: 'تحصيل إيجار',
    description: 'خزينة ← تسوية ذمم مستأجرين',
    category: 'مول',
    default_description: 'تحصيل إيجار محل',
    requires_total_amount: true,
    lines: [
      { category_code: 'AST-CSH', fallback_codes: ['AST-CASH'], side: 'debit', share: 1 },
      { category_code: 'AST-REC', side: 'credit', share: 1 },
    ],
  },
  {
    id: 'service-accrual',
    label: 'استحقاق خدمات',
    description: 'ذمم ← إيراد خدمات المول',
    category: 'مول',
    default_description: 'استحقاق رسوم خدمات ومرافق',
    requires_total_amount: true,
    lines: [
      { category_code: 'AST-REC', side: 'debit', share: 1 },
      { category_code: 'REV-SRV', fallback_codes: ['REV-SVC'], side: 'credit', share: 1 },
    ],
  },
  {
    id: 'deposit-received',
    label: 'تأمين مستأجر',
    description: 'نقدية ← التزام تأمينات',
    category: 'مول',
    default_description: 'استلام تأمين مستأجر',
    requires_total_amount: true,
    lines: [
      { category_code: 'AST-CSH', fallback_codes: ['AST-CASH'], side: 'debit', share: 1 },
      { category_code: 'LIA-DEP', side: 'credit', share: 1 },
    ],
  },
  {
    id: 'deposit-refund',
    label: 'رد تأمين',
    description: 'التزام ← نقدية',
    category: 'مول',
    default_description: 'رد تأمين عند إخلاء المحل',
    requires_total_amount: true,
    lines: [
      { category_code: 'LIA-DEP', side: 'debit', share: 1 },
      { category_code: 'AST-CSH', fallback_codes: ['AST-CASH'], side: 'credit', share: 1 },
    ],
  },
  {
    id: 'penalty-fee',
    label: 'غرامة تأخير',
    description: 'ذمم ← إيراد غرامات',
    category: 'مول',
    default_description: 'غرامة تأخير سداد',
    requires_total_amount: true,
    lines: [
      { category_code: 'AST-REC', side: 'debit', share: 1 },
      { category_code: 'REV-PEN', fallback_codes: ['REV-RNT'], side: 'credit', share: 1 },
    ],
  },
  {
    id: 'revenue-cash',
    label: 'إيراد نقدي',
    description: 'خزينة ← إيراد عام',
    category: 'إيراد',
    default_description: 'إيراد نقدي',
    requires_total_amount: true,
    lines: [
      { category_code: 'AST-CSH', fallback_codes: ['AST-CASH'], side: 'debit', share: 1 },
      { category_code: 'REV-GEN', side: 'credit', share: 1 },
    ],
  },
  {
    id: 'parking-revenue',
    label: 'إيراد مواقف',
    category: 'إيراد',
    description: 'خزينة ← إيراد مواقف',
    default_description: 'إيراد مواقف السيارات',
    requires_total_amount: true,
    lines: [
      { category_code: 'AST-CSH', fallback_codes: ['AST-CASH'], side: 'debit', share: 1 },
      { category_code: 'REV-PRK', fallback_codes: ['REV-GEN'], side: 'credit', share: 1 },
    ],
  },
  {
    id: 'expense-cash',
    label: 'صرف مصروف نقدي',
    description: 'مصروف ← خزينة',
    category: 'مصروف',
    default_description: 'صرف مصروف تشغيلي',
    requires_total_amount: true,
    lines: [
      { category_code: 'EXP-OTH', fallback_codes: ['EXP-GEN'], side: 'debit', share: 1 },
      { category_code: 'AST-CSH', fallback_codes: ['AST-CASH'], side: 'credit', share: 1 },
    ],
  },
  {
    id: 'salary-payment',
    label: 'صرف مرتبات',
    category: 'مصروف',
    description: 'مرتبات ← خزينة',
    default_description: 'صرف مرتبات الموظفين',
    requires_total_amount: true,
    lines: [
      { category_code: 'EXP-SAL', side: 'debit', share: 1 },
      { category_code: 'AST-CSH', fallback_codes: ['AST-CASH'], side: 'credit', share: 1 },
    ],
  },
  {
    id: 'electricity',
    label: 'فاتورة كهرباء',
    category: 'مصروف',
    description: 'كهرباء ← خزينة',
    default_description: 'صرف فاتورة كهرباء',
    requires_total_amount: true,
    lines: [
      { category_code: 'EXP-ELC', side: 'debit', share: 1 },
      { category_code: 'AST-CSH', fallback_codes: ['AST-CASH'], side: 'credit', share: 1 },
    ],
  },
  {
    id: 'maintenance',
    label: 'صيانة',
    category: 'مصروف',
    description: 'صيانة ← خزينة',
    default_description: 'مصروف صيانة وقطع غيار',
    requires_total_amount: true,
    lines: [
      { category_code: 'EXP-MNT', side: 'debit', share: 1 },
      { category_code: 'AST-CSH', fallback_codes: ['AST-CASH'], side: 'credit', share: 1 },
    ],
  },
  {
    id: 'security',
    label: 'أمن وحراسة',
    category: 'مصروف',
    description: 'أمن ← خزينة',
    default_description: 'خدمات أمن وحراسة',
    requires_total_amount: true,
    lines: [
      { category_code: 'EXP-SEC', side: 'debit', share: 1 },
      { category_code: 'AST-CSH', fallback_codes: ['AST-CASH'], side: 'credit', share: 1 },
    ],
  },
  {
    id: 'bank-fees',
    label: 'عمولة مصرفية',
    category: 'مصروف',
    description: 'عمولات ← خزينة',
    default_description: 'عمولة مصرفية',
    requires_total_amount: true,
    lines: [
      { category_code: 'EXP-BNK', side: 'debit', share: 1 },
      { category_code: 'AST-CSH', fallback_codes: ['AST-CASH'], side: 'credit', share: 1 },
    ],
  },
  {
    id: 'opening-balance',
    label: 'قيد افتتاحي',
    category: 'عام',
    description: 'أصول نقدية ← حقوق ملكية افتتاحية',
    default_description: 'قيد افتتاحي للفترة',
    requires_total_amount: true,
    lines: [
      { category_code: 'AST-CSH', fallback_codes: ['AST-CASH'], side: 'debit', share: 1 },
      { category_code: 'EQ-OPB', fallback_codes: ['EQT-OPN'], side: 'credit', share: 1 },
    ],
  },
  {
    id: 'cash-transfer-internal',
    label: 'تحويل داخلي',
    category: 'عام',
    description: 'حركة بين حساب نقدي واحد (تسوية وصفية)',
    default_description: 'تحويل / تسوية داخلية',
    requires_total_amount: true,
    lines: [
      { category_code: 'AST-CSH', fallback_codes: ['AST-CASH'], side: 'debit', share: 1, description: 'طرف مدين' },
      { category_code: 'AST-CSH', fallback_codes: ['AST-CASH'], side: 'credit', share: 1, description: 'طرف دائن' },
    ],
  },
];

function resolveCategoryId(
  code: string,
  fallbackCodes: string[] | undefined,
  categoriesByCode: Map<string, string>,
): string | null {
  if (categoriesByCode.has(code)) return categoriesByCode.get(code)!;
  for (const alt of fallbackCodes ?? []) {
    if (categoriesByCode.has(alt)) return categoriesByCode.get(alt)!;
  }
  return null;
}

export function resolveTemplateLines(
  template: JournalTemplate,
  categoriesByCode: Map<string, string>,
  totalAmount?: number,
): Array<{
  category_id: string;
  side: 'debit' | 'credit';
  amount: number;
  description?: string;
}> | null {
  const total = totalAmount && totalAmount > 0 ? totalAmount : 0;
  if (template.requires_total_amount && total <= 0) return null;

  const resolved: Array<{
    category_id: string;
    side: 'debit' | 'credit';
    amount: number;
    description?: string;
  }> = [];

  const missing: string[] = [];

  for (const line of template.lines) {
    const categoryId = resolveCategoryId(
      line.category_code,
      line.fallback_codes,
      categoriesByCode,
    );
    if (!categoryId) {
      missing.push(line.category_code);
      continue;
    }

    const amt =
      line.fixed_amount ??
      (line.share != null && total > 0 ? total * line.share : 0);

    if (amt <= 0) return null;

    resolved.push({
      category_id: categoryId,
      side: line.side,
      amount: amt,
      description: line.description,
    });
  }

  if (missing.length > 0) return null;
  return resolved.length >= 2 ? resolved : null;
}

export function getTemplateMissingCodes(
  template: JournalTemplate,
  categoriesByCode: Map<string, string>,
): string[] {
  const missing: string[] = [];
  for (const line of template.lines) {
    if (!resolveCategoryId(line.category_code, line.fallback_codes, categoriesByCode)) {
      missing.push(line.category_code);
    }
  }
  return missing;
}
