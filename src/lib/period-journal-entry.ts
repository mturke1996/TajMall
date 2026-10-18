import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type { JournalEntryRow, JournalStatus } from '@/lib/db/journal-queries';
import type { CashboxKind } from '@/lib/db/types';
import { BRAND } from '@/lib/brand';
import {
  formatReportPeriodLabelAr,
  formatReportPeriodSlugEn,
  reportPeriodDateRange,
  type ReportPeriod,
} from '@/lib/report-period';
import { buildPdfFileName } from '@/lib/report-pdf-export';
import { resolveCashboxKind } from '@/lib/cashbox-labels';

export type PeriodJournalExportNames = {
  /** اسم الملف بدون .pdf — للتحميل والمشاركة */
  fileName: string;
  /** عنوان يظهر في نافذة المشاركة (واتساب، إلخ) */
  shareTitle: string;
  /** نص توضيحي يُرفق مع المشاركة */
  shareText: string;
  /** عنوان وثيقة PDF الداخلي */
  documentTitle: string;
};

/** تسمية واضحة عند التحميل أو مشاركة قيد الفترة */
export function formatPeriodJournalExportNames(
  period: ReportPeriod,
  model?: Pick<
    PeriodJournalEntryModel,
    | 'lines'
    | 'sourceEntryCount'
    | 'periodLabel'
    | 'balanced'
    | 'categoryFilter'
    | 'typeGroupFilter'
  > | null,
): PeriodJournalExportNames {
  const periodLabel = model?.periodLabel ?? formatReportPeriodLabelAr(period);
  const typeGroup = model?.typeGroupFilter;
  const categorySlug = model?.categoryFilter?.code;
  const groupSlug =
    typeGroup?.mode === 'group'
      ? 'rev-exp-grouped'
      : typeGroup?.accountType === 'REVENUE'
        ? 'all-revenue'
        : typeGroup?.accountType === 'EXPENSE'
          ? 'all-expense'
          : null;
  const fileName = buildPdfFileName(
    'period-journal',
    formatReportPeriodSlugEn(period),
    categorySlug ??
      groupSlug ??
      (model?.categoryFilter || typeGroup ? undefined : 'comprehensive'),
  );

  const categoryNote = model?.categoryFilter
    ? ` · بند ${model.categoryFilter.name_ar}`
    : typeGroup
      ? ` · ${typeGroup.name_ar}`
      : ' · شامل كل البنود';
  const shareTitle = `قيد محاسبي — ${periodLabel}${categoryNote} · ${BRAND.name}`;
  const lineCount = model?.lines.length ?? 0;
  const entryCount = model?.sourceEntryCount ?? 0;
  const balanceNote =
    model?.balanced === false ? ' (يتطلب مراجعة — غير متوازن)' : '';
  const scopeLine = model?.categoryFilter
    ? `كشف بند ${model.categoryFilter.name_ar} (${model.categoryFilter.code}): النقدي بجدول مدين/دائن للمجموع، وكل مصرف في ورقة مستقلة.`
    : typeGroup?.mode === 'group'
      ? `تجميع بنود الفترة: جميع الإيرادات معاً وجميع المصاريف معاً مع أطراف الخزينة، مبني على ${entryCount} قيد مصدر.`
      : typeGroup?.accountType
        ? `مجموع ${typeGroup.name_ar} فقط — قيد مزدوج (مدين/دائن البند + الطرف المقابل) بلا تفصيل · ${periodLabel}.`
        : lineCount > 0
          ? `تقرير شامل: ${lineCount} بنداً — مجاميع ثم مجموع كل بند (مدين البند + دائن الخزينة) بدون تفصيل القيود، مبني على ${entryCount} قيد مصدر.`
          : 'لا توجد حركة محاسبية في هذه الفترة.';

  const shareText = [
    `قيد محاسبي للفترة: ${periodLabel}${balanceNote}.`,
    scopeLine,
    `${BRAND.fullName} — ${BRAND.tagline}`,
  ].join('\n');

  const documentTitle = model?.categoryFilter
    ? `${BRAND.name} — كشف بند — ${model.categoryFilter.name_ar} — ${periodLabel}`
    : typeGroup
      ? `${BRAND.name} — ${typeGroup.name_ar} — ${periodLabel}`
      : `${BRAND.name} — قيد الفترة الشامل — ${periodLabel}`;

  return { fileName, shareTitle, shareText, documentTitle };
}

/** حركة تفصيلية على بند خلال الفترة (مبالغ البند فقط — صحيحة محاسبياً) */
export type PeriodJournalMovement = {
  journal_id: string;
  journal_number: number;
  entry_date: string;
  journal_reference: string | null;
  journal_description: string | null;
  line_description: string | null;
  cashbox_id: string | null;
  cashbox_name: string | null;
  cashbox_code: string | null;
  /** CASH | BANK | CARD | OTHER */
  cashbox_kind: CashboxKind | null;
  contact_name: string | null;
  debit: number;
  credit: number;
  /** وصف الطرف/الأطراف المقابلة من نفس القيد (للبيان فقط — لا يُدمج في المدين/الدائن) */
  contra_label: string | null;
};

/** سطر داخل قيد يومية معروض بالكامل */
export type PeriodJournalVoucherLine = {
  category_id: string;
  category_code: string;
  category_name: string;
  category_type: string | null;
  cashbox_name: string | null;
  cashbox_code: string | null;
  cashbox_kind: CashboxKind | null;
  contact_name: string | null;
  line_description: string | null;
  debit: number;
  credit: number;
  /** هل هذا السطر على البند المختار في الفلتر */
  is_focus: boolean;
};

/**
 * قيد يومية كامل (كل أطرافه) — العرض المهني عند اختيار بند:
 * مدين المصروف وسطر دائن الخزينة ظاهران معاً بنفس رقم القيد.
 */
export type PeriodJournalVoucher = {
  journal_id: string;
  journal_number: number;
  entry_date: string;
  journal_reference: string | null;
  journal_description: string | null;
  lines: PeriodJournalVoucherLine[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
};

export type PeriodJournalLine = {
  category_id: string;
  category_code: string;
  category_name: string;
  category_type: string | null;
  /**
   * عند وجود cashbox_id يُقسَم البند (مثل AST-CSH) صفاً لكل خزينة/مصرف.
   * null = صف مجمّع عادي بدون تقسيم.
   */
  cashbox_id: string | null;
  cashbox_name: string | null;
  /** CASH | BANK | CARD | OTHER — يُستعمل لفصل النقدي عن المصارف في التقارير */
  cashbox_kind: CashboxKind | null;
  /** مفتاح صف فريد للواجهة (category + cashbox) */
  rowKey: string;
  /** إجمالي المدين للفترة على هذا البند */
  debit: number;
  /** إجمالي الدائن للفترة على هذا البند */
  credit: number;
  /** صافي الحركة (مدين − دائن) */
  net: number;
  /** الحركات التفصيلية مرتبة بالتاريخ — مبالغ هذا البند فقط */
  movements: PeriodJournalMovement[];
};

/**
 * قسم تقرير عند اختيار بند: كل خزينة/مصرف في صفحة مستقلة (مجموع فقط).
 * المصروف/الأصل: البند مدين والطرف المقابل دائن.
 * الإيراد/الالتزام/حقوق الملكية: البند دائن والطرف المقابل مدين.
 */
export type PeriodCashBankSection = {
  sectionKey: string;
  sectionKind: 'CASH' | 'BANK' | 'CARD' | 'OTHER' | 'NONE';
  cashbox_id: string | null;
  /** عنوان القسم (اسم البند أو «جميع المصاريف») */
  title: string;
  /** مصدر التمويل / الطرف المقابل: النقدي / اسم المصرف / الذمم… */
  fundingLabel: string;
  /** وصف قصير للعرض */
  subtitle: string;
  /** صف تركيز مجمّع للمجاميع والعنوان */
  focusLine: PeriodJournalLine;
  /**
   * بنود التركيز التفصيلية (عند تجميع عدة مصاريف/إيرادات).
   * إن وُجدت تُعرض كل منها باسمها الواضح في الجدول.
   */
  focusDetailLines?: PeriodJournalLine[];
  contraLines: PeriodJournalLine[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
};

/** حساب دائن بطبيعته (إيراد / التزام / حقوق ملكية) */
export function isCreditNormalAccountType(
  type: string | null | undefined,
): boolean {
  return type === 'REVENUE' || type === 'LIABILITY' || type === 'EQUITY';
}

/**
 * هل صف التركيز يُعرض على الجانب الدائن؟
 * يعتمد نوع الحساب أولاً، ثم أكبر جانب عند غياب النوع.
 */
export function periodJournalFocusIsCredit(
  focusLine: Pick<PeriodJournalLine, 'category_type' | 'debit' | 'credit'>,
): boolean {
  if (isCreditNormalAccountType(focusLine.category_type)) return true;
  if (
    focusLine.category_type === 'EXPENSE' ||
    focusLine.category_type === 'ASSET'
  ) {
    return false;
  }
  return focusLine.credit > focusLine.debit;
}

/** هل هذا حساب ذمم مدينة (لا نعرضه للمستخدم في كشف الإيراد) */
export function isReceivableAccountLine(
  line: Pick<PeriodJournalLine, 'category_code' | 'category_name' | 'category_type'>,
): boolean {
  if (line.category_code === 'AST-REC') return true;
  if (line.category_type !== 'ASSET') return false;
  return /ذمم|receiv/i.test(line.category_name || '');
}

function isReceivableDisplayName(name: string): boolean {
  return /ذمم|receiv/i.test(name);
}

/** اسم الطرف المقابل للعرض (نقدي / مصرف — بدون ذمم المستأجرين) */
export function resolvePeriodJournalContraLabel(
  contraLines: PeriodJournalLine[],
  options?: {
    fundingLabel?: string | null;
    sectionKind?: PeriodCashBankSection['sectionKind'];
  },
): string {
  const funding = options?.fundingLabel?.trim();
  if (funding && funding !== '—') return funding;
  if (options?.sectionKind === 'CASH') return 'خزينة نقدية';
  if (options?.sectionKind === 'BANK') return 'حساب مصرفي';
  if (contraLines.length === 0) return 'الطرف المقابل';
  const names = [
    ...new Set(
      contraLines
        .map((l) => l.cashbox_name?.trim() || l.category_name)
        .filter(
          (n): n is string =>
            Boolean(n && n !== '—' && !isReceivableDisplayName(n)),
        ),
    ),
  ];
  if (names.length === 0) {
    if (contraLines.some((l) => isReceivableAccountLine(l))) {
      return 'إيراد مستحق';
    }
    return 'الطرف المقابل';
  }
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} + ${names[1]}`;
  return `${names[0]} + ${names.length - 1} أخرى`;
}

export type PeriodJournalSectionDisplay = {
  focusIsCredit: boolean;
  focusAmount: number;
  contraAmount: number;
  focusSideLabel: 'مدين' | 'دائن';
  contraSideLabel: 'مدين' | 'دائن';
  /** مثال: «دائن — البند» */
  focusRoleLabel: string;
  /** مثال: «مدين» للطرف المقابل */
  contraRolePrefix: string;
  contraLabel: string;
  /** مثال: «دائن البند» */
  headerFocusLabel: string;
  /** مثال: «مدين ذمم المستأجرين» */
  headerContraLabel: string;
  /** سطر الملخص بلا مبالغ */
  summaryLine: string;
};

/**
 * وصف عرض قسم قيد الفترة — يصحّح قطبية الإيراد (دائن)
 * مقابل المصروف (مدين) حتى لا يظهر الرقم 0/0 على بنود مثل REV-RNT.
 */
export function describePeriodJournalSectionDisplay(
  focusLine: PeriodJournalLine,
  contraLines: PeriodJournalLine[],
  options?: {
    fundingLabel?: string | null;
    sectionKind?: PeriodCashBankSection['sectionKind'];
    focusTitle?: string;
  },
): PeriodJournalSectionDisplay {
  const focusIsCredit = periodJournalFocusIsCredit(focusLine);
  const focusAmount = focusIsCredit ? focusLine.credit : focusLine.debit;
  const contraAmount = focusIsCredit
    ? contraLines.reduce((s, l) => s + l.debit, 0)
    : contraLines.reduce((s, l) => s + l.credit, 0);
  const focusSideLabel: 'مدين' | 'دائن' = focusIsCredit ? 'دائن' : 'مدين';
  const contraSideLabel: 'مدين' | 'دائن' = focusIsCredit ? 'مدين' : 'دائن';
  const title = options?.focusTitle || focusLine.category_name;
  const contraLabel = resolvePeriodJournalContraLabel(contraLines, options);

  return {
    focusIsCredit,
    focusAmount,
    contraAmount,
    focusSideLabel,
    contraSideLabel,
    focusRoleLabel: `${focusSideLabel} — البند`,
    contraRolePrefix: contraSideLabel,
    contraLabel,
    headerFocusLabel: `${focusSideLabel} البند`,
    headerContraLabel: `${contraSideLabel} ${contraLabel}`,
    summaryLine: `مجموع فقط · ${focusSideLabel} «${title}» · ${contraSideLabel} «${contraLabel}»`,
  };
}

export function periodLineRowKey(
  categoryId: string,
  cashboxId?: string | null,
): string {
  return cashboxId ? `${categoryId}::cb:${cashboxId}` : categoryId;
}

/** فلتر خاص: طيّ كل بنود الإيراد معاً وكل بنود المصروف معاً */
export const PERIOD_JOURNAL_GROUP_BY_TYPE = 'group:type';
/** فلتر خاص: جميع الإيرادات كبند واحد مع الطرف المقابل */
export const PERIOD_JOURNAL_TYPE_REVENUE = 'type:REVENUE';
/** فلتر خاص: جميع المصاريف كبند واحد مع الطرف المقابل */
export const PERIOD_JOURNAL_TYPE_EXPENSE = 'type:EXPENSE';
/** فلتر خاص جديد: كشف الإيرادات والتحصيلات المسجلة فعلياً خلال الفترة بناءً على تاريخ التسجيل/القبض */
export const PERIOD_JOURNAL_MODE_CASH_COLLECTIONS = 'mode:cash_collections';

export type PeriodJournalAccountTypeFilter = 'REVENUE' | 'EXPENSE';

export function isPeriodJournalGroupByType(
  filter: string | null | undefined,
): boolean {
  return filter === PERIOD_JOURNAL_GROUP_BY_TYPE;
}

export function isPeriodJournalCashCollections(
  filter: string | null | undefined,
): boolean {
  return filter === PERIOD_JOURNAL_MODE_CASH_COLLECTIONS;
}

export function parsePeriodJournalTypeFilter(
  filter: string | null | undefined,
): PeriodJournalAccountTypeFilter | null {
  if (filter === PERIOD_JOURNAL_TYPE_REVENUE) return 'REVENUE';
  if (filter === PERIOD_JOURNAL_TYPE_EXPENSE) return 'EXPENSE';
  return null;
}

export function periodJournalTypeFilterMeta(
  type: PeriodJournalAccountTypeFilter,
): { id: string; code: string; name_ar: string; type: PeriodJournalAccountTypeFilter } {
  if (type === 'REVENUE') {
    return {
      id: PERIOD_JOURNAL_TYPE_REVENUE,
      code: 'REV*',
      name_ar: 'جميع الإيرادات',
      type: 'REVENUE',
    };
  }
  return {
    id: PERIOD_JOURNAL_TYPE_EXPENSE,
    code: 'EXP*',
    name_ar: 'جميع المصاريف',
    type: 'EXPENSE',
  };
}

/** بند تحصيل إيراد مسجل خلال الفترة */
export type PeriodCashCollectionItem = {
  transaction_id: string;
  number: number;
  reference: string | null;
  tx_date: string; // تاريخ التسجيل / التحصيل الفعلي (مثلاً في يوليو)
  amount: number;
  method: string;
  category_id: string | null;
  category_name: string;
  category_code: string;
  cashbox_id: string | null;
  cashbox_name: string;
  cashbox_kind: CashboxKind | null;
  contact_name: string | null;
  shop_number: string | null;
  description: string | null;
  /** شهر الاستحقاق المستهدف (مثل: إيجار شهر مايو 2026) */
  target_rent_month: string | null;
  target_rent_month_key: string | null; // e.g. "2026-05"
  target_month_status: 'PRIOR' | 'CURRENT' | 'FUTURE' | 'GENERAL';
};

export type PeriodCashCollectionsSummary = {
  periodLabel: string;
  startDate: string;
  endDate: string;
  totalCollected: number;
  totalCount: number;
  priorPeriodAmount: number;
  priorPeriodCount: number;
  currentPeriodAmount: number;
  currentPeriodCount: number;
  futurePeriodAmount: number;
  futurePeriodCount: number;
  generalAmount: number;
  generalCount: number;
  byMethod: Array<{ method: string; count: number; total: number; labelAr: string }>;
  byBank: Array<{ cashboxId: string; name: string; kind: CashboxKind | null; count: number; total: number }>;
  byCategory: Array<{ categoryId: string; name: string; code: string; count: number; total: number }>;
  items: PeriodCashCollectionItem[];
};

const AR_MONTH_PATTERNS: Array<{ name: string; monthNum: number }> = [
  { name: 'يناير', monthNum: 1 },
  { name: 'فبراير', monthNum: 2 },
  { name: 'مارس', monthNum: 3 },
  { name: 'أبريل', monthNum: 4 },
  { name: 'ابريل', monthNum: 4 },
  { name: 'مايو', monthNum: 5 },
  { name: 'يونيو', monthNum: 6 },
  { name: 'يوليو', monthNum: 7 },
  { name: 'أغسطس', monthNum: 8 },
  { name: 'اغسطس', monthNum: 8 },
  { name: 'سبتمبر', monthNum: 9 },
  { name: 'أكتوبر', monthNum: 10 },
  { name: 'اكتوبر', monthNum: 10 },
  { name: 'نوفمبر', monthNum: 11 },
  { name: 'ديسمبر', monthNum: 12 },
];

/**
 * تحليل الوصف واستخراج شهر الاستحقاق الأصلي (مثال: معرفة هل إيراد شهر يوليو يخص شهر مايو مثلاً)
 */
export function extractTargetRentMonth(
  description: string | null | undefined,
  txDate: string,
): {
  target_rent_month: string | null;
  target_rent_month_key: string | null;
  target_month_status: 'PRIOR' | 'CURRENT' | 'FUTURE' | 'GENERAL';
} {
  const txYear = new Date(txDate).getFullYear() || new Date().getFullYear();
  const txMonth = new Date(txDate).getMonth() + 1;
  const txMonthKey = `${txYear}-${String(txMonth).padStart(2, '0')}`;

  if (!description) {
    return {
      target_rent_month: null,
      target_rent_month_key: txMonthKey,
      target_month_status: 'CURRENT',
    };
  }

  const desc = description.toLowerCase();

  // 1. Check for explicit YYYY-MM or MM/YYYY (e.g. 2026-05 or 05/2026 or 5/2026)
  const isoMatch = desc.match(/\b(202\d)-(0[1-9]|1[0-2])\b/);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    const key = `${y}-${String(m).padStart(2, '0')}`;
    const mName = AR_MONTH_PATTERNS.find((p) => p.monthNum === m)?.name || `شهر ${m}`;
    const status = key < txMonthKey ? 'PRIOR' : key === txMonthKey ? 'CURRENT' : 'FUTURE';
    return {
      target_rent_month: `${mName} ${y}`,
      target_rent_month_key: key,
      target_month_status: status,
    };
  }

  const slashMatch = desc.match(/\b(0?[1-9]|1[0-2])\/(202\d)\b/);
  if (slashMatch) {
    const m = Number(slashMatch[1]);
    const y = Number(slashMatch[2]);
    const key = `${y}-${String(m).padStart(2, '0')}`;
    const mName = AR_MONTH_PATTERNS.find((p) => p.monthNum === m)?.name || `شهر ${m}`;
    const status = key < txMonthKey ? 'PRIOR' : key === txMonthKey ? 'CURRENT' : 'FUTURE';
    return {
      target_rent_month: `${mName} ${y}`,
      target_rent_month_key: key,
      target_month_status: status,
    };
  }

  // 2. Check for Arabic month name (e.g. "شهر مايو", "إيجار مايو", "عن شهر مايو 2026")
  for (const { name, monthNum } of AR_MONTH_PATTERNS) {
    if (desc.includes(name)) {
      // Check if there is an explicit year nearby (e.g. 2025, 2026, 2027)
      const yearMatch = desc.match(/\b(202\d)\b/);
      const targetYear = yearMatch ? Number(yearMatch[1]) : txYear;
      const key = `${targetYear}-${String(monthNum).padStart(2, '0')}`;
      const status = key < txMonthKey ? 'PRIOR' : key === txMonthKey ? 'CURRENT' : 'FUTURE';
      return {
        target_rent_month: `${name} ${targetYear}`,
        target_rent_month_key: key,
        target_month_status: status,
      };
    }
  }

  // 3. Check for "شهر X" or "شهر 0X"
  const monthNumMatch = desc.match(/شهر\s*([0-9]|1[0-2])\b/);
  if (monthNumMatch) {
    const m = Number(monthNumMatch[1]);
    if (m >= 1 && m <= 12) {
      const key = `${txYear}-${String(m).padStart(2, '0')}`;
      const mName = AR_MONTH_PATTERNS.find((p) => p.monthNum === m)?.name || `شهر ${m}`;
      const status = key < txMonthKey ? 'PRIOR' : key === txMonthKey ? 'CURRENT' : 'FUTURE';
      return {
        target_rent_month: `${mName} ${txYear}`,
        target_rent_month_key: key,
        target_month_status: status,
      };
    }
  }

  return {
    target_rent_month: null,
    target_rent_month_key: txMonthKey,
    target_month_status: 'CURRENT',
  };
}

/**
 * بناء تلخيص شامل للإيرادات والتحصيلات المسجلة فعلياً خلال الفترة
 */
export function buildPeriodCashCollectionsSummary(
  transactions: Array<{
    id: string;
    number: number;
    reference: string | null;
    tx_date: string;
    amount: string | number;
    method: string;
    description: string | null;
    category?: { id: string; code: string; name_ar: string } | null;
    cashbox?: { id: string; code?: string; name_ar: string; kind?: CashboxKind | null } | null;
    contact?: { id?: string; name?: string; shop_number?: string | null } | null;
  }>,
  options: {
    startDate: string;
    endDate: string;
    periodLabel: string;
  },
): PeriodCashCollectionsSummary {
  const filtered = transactions.filter((t) => {
    if (!t.tx_date) return false;
    const d = t.tx_date.slice(0, 10);
    return d >= options.startDate && d <= options.endDate;
  });

  let totalCollected = 0;
  let priorPeriodAmount = 0;
  let priorPeriodCount = 0;
  let currentPeriodAmount = 0;
  let currentPeriodCount = 0;
  let futurePeriodAmount = 0;
  let futurePeriodCount = 0;
  let generalAmount = 0;
  let generalCount = 0;

  const methodMap = new Map<string, { count: number; total: number; labelAr: string }>();
  const bankMap = new Map<string, { cashboxId: string; name: string; kind: CashboxKind | null; count: number; total: number }>();
  const catMap = new Map<string, { categoryId: string; name: string; code: string; count: number; total: number }>();

  const METHOD_LABELS: Record<string, string> = {
    CASH: 'نقدي (CASH)',
    CARD: 'بطاقة مصرفية (POS)',
    TRANSFER: 'حوالة مصرفية (TRANSFER)',
    CHEQUE: 'صك مصرفي (CHEQUE)',
  };

  const items: PeriodCashCollectionItem[] = filtered.map((t) => {
    const amt = Number(t.amount || 0);
    totalCollected += amt;

    const { target_rent_month, target_rent_month_key, target_month_status } =
      extractTargetRentMonth(t.description, t.tx_date);

    if (target_month_status === 'PRIOR') {
      priorPeriodAmount += amt;
      priorPeriodCount += 1;
    } else if (target_month_status === 'CURRENT') {
      currentPeriodAmount += amt;
      currentPeriodCount += 1;
    } else if (target_month_status === 'FUTURE') {
      futurePeriodAmount += amt;
      futurePeriodCount += 1;
    } else {
      generalAmount += amt;
      generalCount += 1;
    }

    // Method breakdown
    const m = t.method || 'CASH';
    const mInfo = methodMap.get(m) || { count: 0, total: 0, labelAr: METHOD_LABELS[m] || m };
    mInfo.count += 1;
    mInfo.total += amt;
    methodMap.set(m, mInfo);

    // Bank breakdown
    const bId = t.cashbox?.id || 'OTHER';
    const bName = t.cashbox?.name_ar || 'بدون تحديد خزينة';
    const bKind = t.cashbox?.kind ?? null;
    const bInfo = bankMap.get(bId) || { cashboxId: bId, name: bName, kind: bKind, count: 0, total: 0 };
    bInfo.count += 1;
    bInfo.total += amt;
    bankMap.set(bId, bInfo);

    // Category breakdown
    const cId = t.category?.id || 'OTHER';
    const cName = t.category?.name_ar || 'بدون بند';
    const cCode = t.category?.code || '—';
    const cInfo = catMap.get(cId) || { categoryId: cId, name: cName, code: cCode, count: 0, total: 0 };
    cInfo.count += 1;
    cInfo.total += amt;
    catMap.set(cId, cInfo);

    return {
      transaction_id: t.id,
      number: t.number,
      reference: t.reference,
      tx_date: t.tx_date,
      amount: amt,
      method: t.method,
      category_id: t.category?.id ?? null,
      category_name: cName,
      category_code: cCode,
      cashbox_id: t.cashbox?.id ?? null,
      cashbox_name: bName,
      cashbox_kind: bKind,
      contact_name: t.contact?.name ?? null,
      shop_number: t.contact?.shop_number ?? null,
      description: t.description,
      target_rent_month,
      target_rent_month_key,
      target_month_status,
    };
  });

  return {
    periodLabel: options.periodLabel,
    startDate: options.startDate,
    endDate: options.endDate,
    totalCollected,
    totalCount: filtered.length,
    priorPeriodAmount,
    priorPeriodCount,
    currentPeriodAmount,
    currentPeriodCount,
    futurePeriodAmount,
    futurePeriodCount,
    generalAmount,
    generalCount,
    byMethod: Array.from(methodMap.entries()).map(([method, val]) => ({ method, ...val })),
    byBank: Array.from(bankMap.values()).sort((a, b) => b.total - a.total),
    byCategory: Array.from(catMap.values()).sort((a, b) => b.total - a.total),
    items: items.sort((a, b) => new Date(b.tx_date).getTime() - new Date(a.tx_date).getTime()),
  };
}


export type PeriodJournalEntryModel = {
  periodLabel: string;
  startDate: string;
  endDate: string;
  title: string;
  description: string;
  statusFilter: JournalStatus | 'ALL';
  /** عند عرض بند واحد فقط */
  categoryFilter?: {
    id: string;
    code: string;
    name_ar: string;
  } | null;
  /**
   * عند تجميع حسب نوع الحساب (إيراد/مصروف):
   * - group = إيرادات معاً ومصاريف معاً في نفس القيد
   * - type = نوع واحد فقط كبند تركيز
   */
  typeGroupFilter?: {
    mode: 'group' | 'type';
    accountType?: PeriodJournalAccountTypeFilter | null;
    name_ar: string;
  } | null;
  sourceEntryCount: number;
  sourceLineCount: number;
  /**
   * true إذا وُقف الجلب عند حد أقصى — المجاميع قد تكون ناقصة.
   * يُفترض false عند جلب بند واحد عبر مسار دفتر الأستاذ / دالة البنود.
   */
  truncated?: boolean;
  lines: PeriodJournalLine[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
  /**
   * عند فلتر بند: قائمة القيود الكاملة (كل طرف بمدينه/دائنه الحقيقي).
   * في الوضع الشامل تبقى فارغة — التفصيل حسب البند.
   */
  vouchers: PeriodJournalVoucher[];
};

type RawLine = {
  journal_id: string;
  category_id: string;
  debit: string | number;
  credit: string | number;
  description: string | null;
  category_code: string | null;
  category_name: string | null;
  category_type: string | null;
  cashbox_id: string | null;
  cashbox_name_ar: string | null;
  cashbox_code: string | null;
  cashbox_kind: CashboxKind | null;
  contact_name: string | null;
  sort_order: number | null;
};

const TYPE_ORDER: Record<string, number> = {
  ASSET: 1,
  LIABILITY: 2,
  EQUITY: 3,
  REVENUE: 4,
  EXPENSE: 5,
};

const EPS = 0.005;

function almostEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= EPS;
}

function sortPeriodLines(lines: PeriodJournalLine[]): PeriodJournalLine[] {
  return [...lines].sort((a, b) => {
    const oA = TYPE_ORDER[a.category_type ?? ''] ?? 99;
    const oB = TYPE_ORDER[b.category_type ?? ''] ?? 99;
    if (oA !== oB) return oA - oB;
    const codeA = a.category_code || 'zzzz';
    const codeB = b.category_code || 'zzzz';
    return codeA.localeCompare(codeB, 'ar');
  });
}

/**
 * يجمع بنود القيود إلى ملخص فترة:
 * كل بند محاسبي مرة واحدة — ما عدا أسطر الخزينة/المصرف المرتبطة بـ cashbox_id
 * فتُقسَم صفاً مستقلاً لكل خزينة (مجموع AST-CSH لكل بنك على حدة).
 */
export function aggregatePeriodJournalLines(
  lines: RawLine[],
  journalsById: Map<string, JournalEntryRow>,
): PeriodJournalLine[] {
  const map = new Map<string, PeriodJournalLine>();

  for (const line of lines) {
    const journal = journalsById.get(line.journal_id);
    if (!journal) continue;
    const categoryId = line.category_id || '_unknown';
    const cashboxId = line.cashbox_id || null;
    const rowKey = periodLineRowKey(categoryId, cashboxId);
    const debit = Number(line.debit) || 0;
    const credit = Number(line.credit) || 0;
    if (debit === 0 && credit === 0) continue;

    const cashbox_kind =
      line.cashbox_kind ??
      resolveCashboxKind({
        kind: line.cashbox_kind,
        code: line.cashbox_code,
        name: line.cashbox_name_ar,
      });

    const movement: PeriodJournalMovement = {
      journal_id: line.journal_id,
      journal_number: journal.number,
      entry_date: journal.entry_date,
      journal_reference: journal.reference,
      journal_description: journal.description,
      line_description: line.description,
      cashbox_id: line.cashbox_id,
      cashbox_name: line.cashbox_name_ar,
      cashbox_code: line.cashbox_code,
      cashbox_kind,
      contact_name: line.contact_name,
      debit,
      credit,
      contra_label: null,
    };

    const existing = map.get(rowKey);
    if (existing) {
      existing.debit += debit;
      existing.credit += credit;
      existing.net = existing.debit - existing.credit;
      existing.movements.push(movement);
      if (!existing.cashbox_name && line.cashbox_name_ar) {
        existing.cashbox_name = line.cashbox_name_ar;
      }
      if (!existing.cashbox_kind && cashbox_kind) {
        existing.cashbox_kind = cashbox_kind;
      }
    } else {
      map.set(rowKey, {
        category_id: categoryId,
        category_code: line.category_code ?? '',
        category_name: line.category_name ?? 'بند غير معروف',
        category_type: line.category_type,
        cashbox_id: cashboxId,
        cashbox_name: line.cashbox_name_ar,
        cashbox_kind,
        rowKey,
        debit,
        credit,
        net: debit - credit,
        movements: [movement],
      });
    }
  }

  for (const row of map.values()) {
    row.movements.sort((a, b) => {
      const d = a.entry_date.localeCompare(b.entry_date);
      if (d !== 0) return d;
      return a.journal_number - b.journal_number;
    });
  }

  const sorted = sortPeriodLines(Array.from(map.values()));
  // خزائن نفس البند: رتّب بالاسم بعد ترتيب الدليل
  return sorted.sort((a, b) => {
    if (a.category_id !== b.category_id) return 0;
    if (!a.cashbox_id && !b.cashbox_id) return 0;
    return (a.cashbox_name || '').localeCompare(b.cashbox_name || '', 'ar');
  });
}

/** اسم الخزينة/المصرف لهذا الصف (صف واحد = خزينة واحدة عند التقسيم) */
export function periodLineCashboxKindsLabel(line: PeriodJournalLine): string {
  if (line.cashbox_kind === 'CASH' && !line.cashbox_id) {
    return 'نقدي';
  }
  return line.cashbox_name?.trim() || '—';
}

function sliceLineToJournals(
  line: PeriodJournalLine,
  journalIds: Set<string>,
): PeriodJournalLine | null {
  const movements = line.movements.filter((m) => journalIds.has(m.journal_id));
  if (movements.length === 0) return null;
  const debit = movements.reduce((s, m) => s + m.debit, 0);
  const credit = movements.reduce((s, m) => s + m.credit, 0);
  return {
    ...line,
    debit,
    credit,
    net: debit - credit,
    movements,
  };
}

function sliceLineExcludingJournals(
  line: PeriodJournalLine,
  excludeJournalIds: Set<string>,
): PeriodJournalLine | null {
  const movements = line.movements.filter(
    (m) => !excludeJournalIds.has(m.journal_id),
  );
  if (movements.length === 0) return null;
  const debit = movements.reduce((s, m) => s + m.debit, 0);
  const credit = movements.reduce((s, m) => s + m.credit, 0);
  return {
    ...line,
    debit,
    credit,
    net: debit - credit,
    movements,
  };
}

/** يدمج صفوف متعددة لنفس البند عند غياب تقسيم خزينة (fallback فقط) */
function mergeCashFocusLines(rows: PeriodJournalLine[]): PeriodJournalLine {
  const base = rows[0];
  const movements = rows
    .flatMap((r) => r.movements)
    .sort((a, b) => {
      const d = a.entry_date.localeCompare(b.entry_date);
      if (d !== 0) return d;
      return a.journal_number - b.journal_number;
    });
  const debit = rows.reduce((s, r) => s + r.debit, 0);
  const credit = rows.reduce((s, r) => s + r.credit, 0);
  return {
    ...base,
    cashbox_id: null,
    cashbox_name: 'النقدي',
    cashbox_kind: 'CASH',
    rowKey: `${base.category_id}::kind:CASH`,
    debit,
    credit,
    net: debit - credit,
    movements,
  };
}

type FundingBucket = {
  key: string;
  kind: PeriodCashBankSection['sectionKind'];
  fundingLabel: string;
  journalIds: Set<string>;
  cashbox_id: string | null;
  cashbox_name: string | null;
  cashbox_kind: CashboxKind | null;
};

function defaultFundingBucketLabel(kind: CashboxKind | null): string {
  if (kind === 'BANK') return 'حساب مصرفي';
  if (kind === 'CARD') return 'بطاقة / POS';
  if (kind === 'OTHER') return 'خزينة أخرى';
  return 'خزينة نقدية';
}

function fundingBucketKey(
  meta: ReturnType<typeof journalCashboxMetaFromModel>,
  journalId: string,
): string {
  return (
    meta?.cashbox_id ||
    meta?.cashbox_code ||
    meta?.cashbox_name ||
    `journal-${journalId}`
  );
}

function createNoneFundingBucket(keyPrefix: string): FundingBucket {
  return {
    key: `${keyPrefix}::kind:NONE`,
    kind: 'NONE',
    fundingLabel: '—',
    journalIds: new Set(),
    cashbox_id: null,
    cashbox_name: null,
    cashbox_kind: null,
  };
}

function assignJournalToFundingBucketMaps(
  model: PeriodJournalEntryModel,
  journalId: string,
  keyPrefix: string,
  cashboxBuckets: Map<string, FundingBucket>,
  noneBucket: FundingBucket,
): void {
  const meta = journalCashboxMetaFromModel(model, journalId);
  const kind =
    meta?.cashbox_kind ??
    resolveCashboxKind({
      code: meta?.cashbox_code,
      name: meta?.cashbox_name,
    });

  if (kind === 'CASH' || kind === 'BANK' || kind === 'CARD' || kind === 'OTHER') {
    const boxKey = fundingBucketKey(meta, journalId);
    let bucket = cashboxBuckets.get(boxKey);
    if (!bucket) {
      const sectionKind: PeriodCashBankSection['sectionKind'] =
        kind === 'CASH'
          ? 'CASH'
          : kind === 'BANK'
            ? 'BANK'
            : kind === 'CARD'
              ? 'CARD'
              : 'OTHER';
      bucket = {
        key: `${keyPrefix}::cb:${boxKey}`,
        kind: sectionKind,
        fundingLabel: meta?.cashbox_name?.trim() || defaultFundingBucketLabel(kind),
        journalIds: new Set(),
        cashbox_id: meta?.cashbox_id ?? null,
        cashbox_name: meta?.cashbox_name ?? null,
        cashbox_kind: kind,
      };
      cashboxBuckets.set(boxKey, bucket);
    }
    bucket.journalIds.add(journalId);
    return;
  }

  noneBucket.journalIds.add(journalId);
}

function fundingKindRank(kind: PeriodCashBankSection['sectionKind']): number {
  if (kind === 'CASH') return 0;
  if (kind === 'BANK') return 1;
  if (kind === 'CARD') return 2;
  if (kind === 'OTHER') return 3;
  return 4;
}

function sortFundingBuckets(
  cashboxBuckets: Map<string, FundingBucket>,
  noneBucket: FundingBucket,
): FundingBucket[] {
  const ordered = [...cashboxBuckets.values()].sort((a, b) => {
    const byKind = fundingKindRank(a.kind) - fundingKindRank(b.kind);
    if (byKind !== 0) return byKind;
    return a.fundingLabel.localeCompare(b.fundingLabel, 'ar');
  });
  if (noneBucket.journalIds.size > 0) ordered.push(noneBucket);
  return ordered;
}

function filterContraLinesForFundingBucket(
  contraLines: PeriodJournalLine[],
  bucket: FundingBucket,
): PeriodJournalLine[] {
  if (bucket.kind === 'NONE') return contraLines;
  return contraLines.filter((l) => {
    if (l.cashbox_id && bucket.cashbox_id) {
      return l.cashbox_id === bucket.cashbox_id;
    }
    if (l.cashbox_name && bucket.cashbox_name) {
      return l.cashbox_name === bucket.cashbox_name;
    }
    if (l.cashbox_kind && bucket.cashbox_kind) {
      return l.cashbox_kind === bucket.cashbox_kind;
    }
    return !l.cashbox_id;
  });
}

/**
 * أطراف مقابلة لصف تركيز (بند أو خزينة محددة) ضمن نفس القيود المصدر.
 */
export function buildContraLinesForFocus(
  model: PeriodJournalEntryModel,
  focusLine: PeriodJournalLine,
): PeriodJournalLine[] {
  const journalIds = new Set(focusLine.movements.map((m) => m.journal_id));
  return buildContraLinesForJournals(model, focusLine, journalIds);
}

/** أطراف مقابلة ضمن مجموعة قيود محددة (لفصل النقدي عن المصارف) */
export function buildContraLinesForJournals(
  model: PeriodJournalEntryModel,
  focusLine: PeriodJournalLine,
  journalIds: Set<string>,
): PeriodJournalLine[] {
  const related: PeriodJournalLine[] = [];
  for (const line of model.lines) {
    if (line.rowKey === focusLine.rowKey) continue;
    /** صفوف نفس البند (تقسيم خزينة/دمج نقدي) ليست أطرافاً مقابلة */
    if (line.category_id === focusLine.category_id) continue;
    const sliced = sliceLineToJournals(line, journalIds);
    if (!sliced) continue;
    related.push(sliced);
  }
  return preferPolarityContraLines(focusLine, sortPeriodLines(related));
}

/**
 * للإيراد (دائن): الطرف المقابل هو الجانب المدين فقط (نقدي/ذمم)،
 * حتى لا يظهر دائن الذمم من قيد التحصيل كطرف مقابل مضلّل.
 */
function preferPolarityContraLines(
  focusLine: Pick<PeriodJournalLine, 'category_type' | 'debit' | 'credit'>,
  contraLines: PeriodJournalLine[],
): PeriodJournalLine[] {
  const withoutReceivables = contraLines.filter(
    (l) => !isReceivableAccountLine(l),
  );
  const pool = withoutReceivables.length > 0 ? withoutReceivables : contraLines;
  if (pool.length <= 1) return pool;
  const focusIsCredit = periodJournalFocusIsCredit(focusLine);
  const preferred = pool.filter((l) =>
    focusIsCredit ? l.debit > EPS : l.credit > EPS,
  );
  if (preferred.length === 0) return pool;

  /** إن وُجدت خزينة/مصرف مدينة، فضّلها — هذا مسار التحصيل النقدي */
  const cashFunding = preferred.filter((l) => Boolean(l.cashbox_id || l.cashbox_kind));
  if (focusIsCredit && cashFunding.length > 0) return cashFunding;
  return preferred;
}

function resolveMovementCashboxKind(
  m: PeriodJournalMovement,
): CashboxKind | null {
  return (
    m.cashbox_kind ??
    resolveCashboxKind({
      kind: m.cashbox_kind,
      code: m.cashbox_code,
      name: m.cashbox_name,
    })
  );
}

/**
 * يستخرج خزينة/مصرف القيد من أي طرف يحمل cashbox.
 * يُستخدم لفصل حركات البند حسب مصدر الدفع (نقدي مقابل كل مصرف).
 */
function journalCashboxMetaFromModel(
  model: PeriodJournalEntryModel,
  journalId: string,
): {
  cashbox_id: string | null;
  cashbox_name: string | null;
  cashbox_code: string | null;
  cashbox_kind: CashboxKind | null;
} | null {
  let fallback: {
    cashbox_id: string | null;
    cashbox_name: string | null;
    cashbox_code: string | null;
    cashbox_kind: CashboxKind | null;
  } | null = null;

  for (const line of model.lines) {
    for (const m of line.movements) {
      if (m.journal_id !== journalId) continue;
      if (!m.cashbox_name && !m.cashbox_id && !line.cashbox_id && !m.cashbox_code) {
        continue;
      }
      const kind = resolveMovementCashboxKind(m) ?? line.cashbox_kind;
      const cashboxId = m.cashbox_id ?? line.cashbox_id;
      const meta = {
        cashbox_id: cashboxId,
        cashbox_name: m.cashbox_name ?? line.cashbox_name,
        cashbox_code: m.cashbox_code,
        cashbox_kind: kind,
      };
      if (cashboxId && m.debit > EPS) return meta;
      if (!fallback) fallback = meta;
    }
  }
  return fallback;
}

function sectionTotals(
  focusLine: PeriodJournalLine,
  contraLines: PeriodJournalLine[],
): Pick<PeriodCashBankSection, 'totalDebit' | 'totalCredit' | 'balanced'> {
  const totalDebit =
    focusLine.debit + contraLines.reduce((s, l) => s + l.debit, 0);
  const totalCredit =
    focusLine.credit + contraLines.reduce((s, l) => s + l.credit, 0);
  return {
    totalDebit,
    totalCredit,
    balanced: almostEqual(totalDebit, totalCredit),
  };
}

/**
 * لجميع المصاريف أو جميع الإيرادات — مجموع فقط بدون تفصيل البنود:
 * صف مدين واحد (جميع المصاريف/الإيرادات)، والنقدي ورقة، وكل مصرف ورقة مستقلة.
 */
export function buildTypeAggregateCashBankSections(
  model: PeriodJournalEntryModel,
  accountType: PeriodJournalAccountTypeFilter,
): PeriodCashBankSection[] {
  const meta = periodJournalTypeFilterMeta(accountType);
  const focusRows = sortPeriodLines(
    model.lines.filter((l) => l.category_type === accountType),
  );
  if (focusRows.length === 0) return [];

  const focusIsCredit = accountType === 'REVENUE';
  const makeSubtitle = (funding: string) =>
    focusIsCredit
      ? `دائن: ${meta.name_ar} (مجموع فقط) · مدين: ${funding}`
      : `مدين: ${meta.name_ar} (مجموع فقط) · دائن: ${funding}`;

  type Bucket = FundingBucket;

  const cashboxBuckets = new Map<string, Bucket>();
  const noneBucket = createNoneFundingBucket(meta.id);

  const allMovements = focusRows.flatMap((r) => r.movements);
  const assignJournalToFundingBucket = (journalId: string) => {
    assignJournalToFundingBucketMaps(
      model,
      journalId,
      meta.id,
      cashboxBuckets,
      noneBucket,
    );
  };

  const collectionIds = findCashReceivableCollectionJournalIds(model, new Set());
  const skipAccrualJournalIds =
    accountType === 'REVENUE'
      ? findRevenueAccrualJournalIdsToSkip(model, collectionIds)
      : new Set<string>();

  for (const m of allMovements) {
    if (skipAccrualJournalIds.has(m.journal_id)) continue;
    assignJournalToFundingBucket(m.journal_id);
  }

  /**
   * تحصيل إيراد نقدي = مدين خزينة + دائن ذمم بدون سطر إيراد.
   * يُدرج في أقسام النقدي/المصرف حتى يظهر الطرف الذي يتوقعه المستخدم.
   */
  const revenueCollectionFocusExtras: PeriodJournalLine[] = [];
  if (accountType === 'REVENUE') {
    const revenueJournalIds = new Set(
      allMovements
        .map((m) => m.journal_id)
        .filter((id) => !skipAccrualJournalIds.has(id)),
    );
    const collectionOnlyIds = findCashReceivableCollectionJournalIds(
      model,
      revenueJournalIds,
    );
    for (const journalId of collectionOnlyIds) {
      assignJournalToFundingBucket(journalId);
    }
    if (collectionOnlyIds.size > 0) {
      const synthetic = buildSyntheticRevenueFocusFromCollections(
        model,
        collectionOnlyIds,
        meta,
      );
      if (synthetic) revenueCollectionFocusExtras.push(synthetic);
    }
  }

  const orderedBuckets = filterRevenueFundingBuckets(
    sortFundingBuckets(cashboxBuckets, noneBucket),
    collectionIds,
  );

  const focusRowsWithoutAccrual =
    accountType === 'REVENUE' && skipAccrualJournalIds.size > 0
      ? focusRows
          .map((row) => sliceLineExcludingJournals(row, skipAccrualJournalIds))
          .filter((row): row is PeriodJournalLine => row != null)
      : focusRows;

  const focusRowsWithCollections = [
    ...focusRowsWithoutAccrual,
    ...revenueCollectionFocusExtras,
  ];

  if (orderedBuckets.length === 0) {
    const focusLine = mergePeriodJournalLines(focusRowsWithCollections, {
      id: meta.id,
      code: meta.code,
      name_ar: meta.name_ar,
      type: accountType,
    });
    const contraLines = buildContraLinesForJournals(
      model,
      { ...focusLine, category_id: '__type_focus__' },
      new Set(focusLine.movements.map((m) => m.journal_id)),
    ).filter((l) => l.category_type !== accountType);
    const contraLabel = resolvePeriodJournalContraLabel(contraLines, {
      sectionKind: 'NONE',
    });
    return [
      {
        sectionKey: focusLine.rowKey,
        sectionKind: 'NONE',
        cashbox_id: null,
        title: meta.name_ar,
        fundingLabel: contraLabel,
        subtitle: makeSubtitle(contraLabel),
        focusLine: {
          ...focusLine,
          cashbox_id: null,
          cashbox_name: null,
          cashbox_kind: null,
        },
        contraLines,
        ...sectionTotals(focusLine, contraLines),
      },
    ];
  }

  const sections: PeriodCashBankSection[] = [];

  for (const bucket of orderedBuckets) {
    const detailLines = focusRowsWithCollections
      .map((row) => sliceLineToJournals(row, bucket.journalIds))
      .filter((row): row is PeriodJournalLine => row != null);

    if (detailLines.length === 0) continue;

    /** مجموع فقط — صف مدين واحد بلا تفصيل البنود */
    const focusLine = mergePeriodJournalLines(detailLines, {
      id: meta.id,
      code: meta.code,
      name_ar: meta.name_ar,
      type: accountType,
    });
    const focusClean: PeriodJournalLine = {
      ...focusLine,
      cashbox_id: null,
      cashbox_name: null,
      cashbox_kind: null,
      rowKey: bucket.key,
    };

    let contraLines = buildContraLinesForJournals(
      model,
      { ...focusClean, category_id: '__type_focus__' },
      bucket.journalIds,
    ).filter((l) => l.category_type !== accountType);

    contraLines = filterContraLinesForFundingBucket(contraLines, bucket);

    const contraLabel =
      bucket.kind === 'NONE'
        ? resolvePeriodJournalContraLabel(contraLines, {
            sectionKind: 'NONE',
          })
        : bucket.fundingLabel;

    sections.push({
      sectionKey: bucket.key,
      sectionKind: bucket.kind,
      cashbox_id: bucket.cashbox_id,
      title: meta.name_ar,
      fundingLabel: contraLabel,
      subtitle: makeSubtitle(contraLabel),
      focusLine: focusClean,
      contraLines,
      ...sectionTotals(focusClean, contraLines),
    });
  }

  return sections;
}

/**
 * عند اختيار بند: يفصل التقرير إلى
 * 1) قسم النقدي — البند مدين + النقدي دائن (مجموع فقط)
 * 2) قسم لكل مصرف — البند مدين + هذا المصرف دائن (ورقة مستقلة)
 *
 * يدعم أيضاً type:EXPENSE / type:REVENUE كمجموع فقط بلا تفصيل البنود.
 */
export function buildCashBankSeparatedSections(
  model: PeriodJournalEntryModel,
  focusCategoryId: string,
): PeriodCashBankSection[] {
  const typeFilter = parsePeriodJournalTypeFilter(focusCategoryId);
  if (typeFilter) {
    return buildTypeAggregateCashBankSections(model, typeFilter);
  }

  return buildCashBankSeparatedSectionsCore(model, focusCategoryId);
}

function buildCashBankSeparatedSectionsCore(
  model: PeriodJournalEntryModel,
  focusCategoryId: string,
): PeriodCashBankSection[] {
  const focusRows = model.lines.filter((l) => l.category_id === focusCategoryId);
  if (focusRows.length === 0) return [];

  const categoryName = focusRows[0]?.category_name || 'البند';
  const categoryCode = focusRows[0]?.category_code || '';
  const focusType = focusRows[0]?.category_type ?? null;
  const focusIsCredit = isCreditNormalAccountType(focusType);
  const focusIsCashboxSplit = focusRows.some((l) => l.cashbox_id);
  const sections: PeriodCashBankSection[] = [];

  const makeSubtitle = (funding: string) =>
    focusIsCredit
      ? `دائن: ${categoryName} · مدين: ${funding}`
      : `مدين: ${categoryName} · دائن: ${funding}`;

  /** صف تركيز باسم البند فقط — لا نضع اسم الخزينة فوق اسم البند */
  const asCategoryFocus = (
    line: PeriodJournalLine,
    rowKey: string,
  ): PeriodJournalLine => ({
    ...line,
    cashbox_id: null,
    cashbox_name: null,
    cashbox_kind: null,
    rowKey,
  });

  if (focusIsCashboxSplit) {
    const cashboxSplitRows = focusRows
      .filter((l) => l.cashbox_id)
      .sort((a, b) =>
        (a.cashbox_name || '').localeCompare(b.cashbox_name || '', 'ar'),
      );
    const plainRows = focusRows.filter((l) => !l.cashbox_id);

    for (const row of cashboxSplitRows) {
      const kind = row.cashbox_kind ?? 'OTHER';
      const sectionKind: PeriodCashBankSection['sectionKind'] =
        kind === 'CASH'
          ? 'CASH'
          : kind === 'BANK'
            ? 'BANK'
            : kind === 'CARD'
              ? 'CARD'
              : 'OTHER';
      const funding =
        row.cashbox_name?.trim() || defaultFundingBucketLabel(kind);
      const focusLine = asCategoryFocus(row, row.rowKey);
      const contraLines = filterContraLinesForFundingBucket(
        buildContraLinesForFocus(model, row),
        {
          key: row.rowKey,
          kind: sectionKind,
          fundingLabel: funding,
          journalIds: new Set(focusLine.movements.map((m) => m.journal_id)),
          cashbox_id: row.cashbox_id,
          cashbox_name: row.cashbox_name,
          cashbox_kind: row.cashbox_kind,
        },
      );
      sections.push({
        sectionKey: row.rowKey,
        sectionKind,
        cashbox_id: row.cashbox_id,
        title: categoryName,
        fundingLabel: funding,
        subtitle: makeSubtitle(funding),
        focusLine,
        contraLines,
        ...sectionTotals(focusLine, contraLines),
      });
    }

    for (const row of plainRows) {
      const contraLines = buildContraLinesForFocus(model, row);
      const contraLabel = resolvePeriodJournalContraLabel(contraLines, {
        sectionKind: 'NONE',
      });
      sections.push({
        sectionKey: row.rowKey,
        sectionKind: 'NONE',
        cashbox_id: null,
        title: categoryName,
        fundingLabel: contraLabel,
        subtitle: makeSubtitle(contraLabel),
        focusLine: asCategoryFocus(row, row.rowKey),
        contraLines,
        ...sectionTotals(row, contraLines),
      });
    }

    return sections;
  }

  /** بند عادي (مصروف/إيراد…): قسّم حسب مصدر الدفع — كل خزينة/مصرف بورقة */
  const template = focusRows[0];
  const allMovements = focusRows.flatMap((r) => r.movements);

  type Bucket = FundingBucket;

  const cashboxBuckets = new Map<string, Bucket>();
  const noneBucket = createNoneFundingBucket(focusCategoryId);

  const assignJournalToFundingBucket = (journalId: string) => {
    assignJournalToFundingBucketMaps(
      model,
      journalId,
      focusCategoryId,
      cashboxBuckets,
      noneBucket,
    );
  };

  const collectionIds = findCashReceivableCollectionJournalIds(model, new Set());
  const skipAccrualJournalIds = focusIsCredit
    ? findRevenueAccrualJournalIdsToSkip(
        model,
        collectionIds,
        focusCategoryId,
      )
    : new Set<string>();

  for (const m of allMovements) {
    if (skipAccrualJournalIds.has(m.journal_id)) continue;
    assignJournalToFundingBucket(m.journal_id);
  }

  const revenueCollectionExtras =
    focusIsCredit
      ? augmentRevenueCollectionCashBuckets(
          model,
          new Set(allMovements.map((m) => m.journal_id)),
          assignJournalToFundingBucket,
          {
            id: focusCategoryId,
            code: categoryCode,
            name_ar: categoryName,
            type: focusType ?? 'REVENUE',
          },
        )
      : [];

  const activeMovements = allMovements.filter(
    (m) => !skipAccrualJournalIds.has(m.journal_id),
  );

  const allMovementsIncludingCollections = [
    ...activeMovements,
    ...revenueCollectionExtras.flatMap((r) => r.movements),
  ];

  const orderedBuckets = filterRevenueFundingBuckets(
    sortFundingBuckets(cashboxBuckets, noneBucket),
    collectionIds,
  );

  if (orderedBuckets.length === 0) {
    const focusLine =
      focusRows.length === 1
        ? asCategoryFocus(focusRows[0], focusRows[0].rowKey)
        : asCategoryFocus(
            mergeCashFocusLines(focusRows),
            `${focusCategoryId}::all`,
          );
    const contraLines = buildContraLinesForFocus(model, focusRows[0]);
    const contraLabel = resolvePeriodJournalContraLabel(contraLines, {
      sectionKind: 'NONE',
    });
    return [
      {
        sectionKey: focusLine.rowKey,
        sectionKind: 'NONE',
        cashbox_id: null,
        title: categoryName,
        fundingLabel: contraLabel,
        subtitle: makeSubtitle(contraLabel),
        focusLine,
        contraLines,
        ...sectionTotals(focusLine, contraLines),
      },
    ];
  }

  for (const bucket of orderedBuckets) {
    const movements = allMovementsIncludingCollections
      .filter((m) => bucket.journalIds.has(m.journal_id))
      .sort((a, b) => {
        const d = a.entry_date.localeCompare(b.entry_date);
        if (d !== 0) return d;
        return a.journal_number - b.journal_number;
      });
    const debit = movements.reduce((s, m) => s + m.debit, 0);
    const credit = movements.reduce((s, m) => s + m.credit, 0);
    const focusLine: PeriodJournalLine = {
      ...template,
      category_name: categoryName,
      category_code: categoryCode,
      cashbox_id: null,
      cashbox_name: null,
      cashbox_kind: null,
      rowKey: bucket.key,
      debit,
      credit,
      net: debit - credit,
      movements,
    };
    const contraLines = filterContraLinesForFundingBucket(
      buildContraLinesForJournals(model, focusLine, bucket.journalIds),
      bucket,
    );

    const contraLabel =
      bucket.kind === 'NONE'
        ? resolvePeriodJournalContraLabel(contraLines, {
            sectionKind: 'NONE',
          })
        : bucket.fundingLabel;

    sections.push({
      sectionKey: bucket.key,
      sectionKind: bucket.kind,
      cashbox_id: bucket.cashbox_id,
      title: categoryName,
      fundingLabel: contraLabel,
      subtitle: makeSubtitle(contraLabel),
      focusLine,
      contraLines,
      ...sectionTotals(focusLine, contraLines),
    });
  }

  return sections;
}

export type PeriodCashboxRef = {
  id: string;
  name_ar: string;
  kind: CashboxKind;
  code: string;
};

function sectionKindFromCashboxKind(
  kind: CashboxKind,
): Exclude<PeriodCashBankSection['sectionKind'], 'NONE'> {
  if (kind === 'CASH' || kind === 'BANK' || kind === 'CARD' || kind === 'OTHER') {
    return kind;
  }
  return 'OTHER';
}

function withEnsuredCashboxContra(
  section: PeriodCashBankSection,
): PeriodCashBankSection {
  if (section.sectionKind === 'NONE') return section;
  if (section.contraLines.length > 0) return section;
  const focusIsCredit = periodJournalFocusIsCredit(section.focusLine);
  const amount = focusIsCredit ? section.focusLine.credit : section.focusLine.debit;
  if (amount <= EPS) return section;
  const contra: PeriodJournalLine = {
    category_id: 'AST-CSH',
    category_code: 'AST-CSH',
    category_name: section.fundingLabel,
    category_type: 'ASSET',
    cashbox_id: section.cashbox_id,
    cashbox_name: section.fundingLabel,
    cashbox_kind: section.sectionKind,
    rowKey: `${section.sectionKey}::contra`,
    debit: focusIsCredit ? amount : 0,
    credit: focusIsCredit ? 0 : amount,
    net: (focusIsCredit ? amount : 0) - (focusIsCredit ? 0 : amount),
    movements: [],
  };
  const contraLines = [contra];
  return {
    ...section,
    contraLines,
    ...sectionTotals(section.focusLine, contraLines),
  };
}

function emptyCashboxJournalSection(
  focus: PeriodJournalLine,
  box: PeriodCashboxRef,
): PeriodCashBankSection {
  const kind = sectionKindFromCashboxKind(box.kind);
  const focusLine: PeriodJournalLine = {
    ...focus,
    cashbox_id: null,
    cashbox_name: null,
    cashbox_kind: null,
    rowKey: `${focus.category_id}::cb:${box.id}::empty`,
    debit: 0,
    credit: 0,
    net: 0,
    movements: [],
  };
  const contra: PeriodJournalLine = {
    category_id: 'AST-CSH',
    category_code: 'AST-CSH',
    category_name: box.name_ar,
    category_type: 'ASSET',
    cashbox_id: box.id,
    cashbox_name: box.name_ar,
    cashbox_kind: box.kind,
    rowKey: `${focus.category_id}::cb:${box.id}::empty-contra`,
    debit: 0,
    credit: 0,
    net: 0,
    movements: [],
  };
  return {
    sectionKey: `${focus.category_id}::cb:${box.id}`,
    sectionKind: kind,
    cashbox_id: box.id,
    title: focus.category_name,
    fundingLabel: box.name_ar,
    subtitle: `لا حركة على ${box.name_ar} في هذه الفترة`,
    focusLine,
    contraLines: [contra],
    totalDebit: 0,
    totalCredit: 0,
    balanced: true,
  };
}

/**
 * قيد مستقل لكل خزينة نقدية ولكل مصرف — بالترتيب: النقد ثم المصارف.
 * الخزائن بلا حركة تظهر بجدول مدين/دائن صفري حتى تكتمل الصورة.
 */
export function completeCashboxJournalSections(
  sections: PeriodCashBankSection[],
  cashboxes: PeriodCashboxRef[],
  focusTemplate: PeriodJournalLine | null,
): PeriodCashBankSection[] {
  const normalized = sections.map(withEnsuredCashboxContra);
  if (!focusTemplate || cashboxes.length === 0) {
    return [...normalized].sort((a, b) => {
      const byKind = fundingKindRank(a.sectionKind) - fundingKindRank(b.sectionKind);
      if (byKind !== 0) return byKind;
      return a.fundingLabel.localeCompare(b.fundingLabel, 'ar');
    });
  }

  const used = new Set<string>();
  const byId = new Map(
    normalized.filter((s) => s.cashbox_id).map((s) => [s.cashbox_id as string, s]),
  );
  const byName = new Map(normalized.map((s) => [s.fundingLabel.trim(), s]));
  const orderedBoxes = [...cashboxes].sort((a, b) => {
    const byKind =
      fundingKindRank(sectionKindFromCashboxKind(a.kind)) -
      fundingKindRank(sectionKindFromCashboxKind(b.kind));
    if (byKind !== 0) return byKind;
    return a.name_ar.localeCompare(b.name_ar, 'ar');
  });

  const out: PeriodCashBankSection[] = [];
  for (const box of orderedBoxes) {
    const remaining = normalized.filter((s) => !used.has(s.sectionKey));
    const existing =
      byId.get(box.id) ??
      byName.get(box.name_ar.trim()) ??
      remaining.find((s) => s.cashbox_id === box.id) ??
      (box.kind === 'CASH'
        ? remaining.find((s) => s.sectionKind === 'CASH')
        : remaining.find(
            (s) =>
              s.sectionKind === 'BANK' &&
              (s.fundingLabel.includes(box.name_ar) ||
                box.name_ar.includes(s.fundingLabel) ||
                (s.cashbox_id == null &&
                  box.code &&
                  s.fundingLabel.toUpperCase().includes(box.code))),
          )) ??
      null;
    if (existing) {
      used.add(existing.sectionKey);
      out.push({
        ...existing,
        cashbox_id: box.id,
        fundingLabel: box.name_ar,
      });
    } else {
      out.push(emptyCashboxJournalSection(focusTemplate, box));
    }
  }
  for (const section of normalized) {
    if (!used.has(section.sectionKey) && section.sectionKind === 'NONE') {
      out.push(section);
    }
  }
  return out;
}

export function buildPeriodJournalEntryModel(input: {
  period: ReportPeriod;
  entries: JournalEntryRow[];
  lines: RawLine[];
  statusFilter?: JournalStatus | 'ALL';
  truncated?: boolean;
}): PeriodJournalEntryModel {
  const { startDate, endDate } = reportPeriodDateRange(input.period);
  const periodLabel = formatReportPeriodLabelAr(input.period);
  const journalsById = new Map(input.entries.map((e) => [e.id, e]));
  const aggregated = aggregatePeriodJournalLines(input.lines, journalsById);

  const totalDebit = aggregated.reduce((s, l) => s + l.debit, 0);
  const totalCredit = aggregated.reduce((s, l) => s + l.credit, 0);

  return {
    periodLabel,
    startDate,
    endDate,
    title: `قيد الفترة الشامل — ${periodLabel}`,
    description: `كل البنود التي تحركت خلال ${periodLabel} — كل بند بمبالغه المدينة والدائنة الحقيقية`,
    statusFilter: input.statusFilter ?? 'POSTED',
    categoryFilter: null,
    sourceEntryCount: input.entries.length,
    sourceLineCount: input.lines.filter((l) => journalsById.has(l.journal_id)).length,
    truncated: Boolean(input.truncated),
    lines: aggregated,
    totalDebit,
    totalCredit,
    balanced: almostEqual(totalDebit, totalCredit),
    vouchers: [],
  };
}

/** إجمالي حركة البند (أكبر جانب — للعرض لا للتوازن) */
export function periodJournalGrossMovement(debit: number, credit: number): number {
  return Math.max(debit, credit);
}

type CategoryFilterMeta = {
  id: string;
  code: string;
  name_ar: string;
  type?: string | null;
};

type JournalPeer = {
  category_id: string;
  category_name: string;
  cashbox_name: string | null;
  cashbox_code: string | null;
  cashbox_kind: CashboxKind | null;
  debit: number;
  credit: number;
};

function formatAmountPlain(n: number): string {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}

/** ملخص الطرف المقابل للبيان فقط — لا يُحقن في أعمدة المدين/الدائن */
function buildContraLabel(peers: JournalPeer[]): string | null {
  if (peers.length === 0) return null;
  return peers
    .map((p) => {
      const side =
        p.debit > EPS && p.credit <= EPS
          ? `مدين ${formatAmountPlain(p.debit)}`
          : p.credit > EPS && p.debit <= EPS
            ? `دائن ${formatAmountPlain(p.credit)}`
            : `مدين ${formatAmountPlain(p.debit)} / دائن ${formatAmountPlain(p.credit)}`;
      const cash = p.cashbox_name ? ` · ${p.cashbox_name}` : '';
      return `${p.category_name}${cash} (${side})`;
    })
    .join(' + ');
}

/** يضيف وصف الطرف المقابل على كل حركة (للبيان) دون تغيير المبالغ */
export function attachContraLabels(lines: PeriodJournalLine[]): PeriodJournalLine[] {
  const peersByJournal = new Map<string, JournalPeer[]>();

  for (const line of lines) {
    for (const m of line.movements) {
      const list = peersByJournal.get(m.journal_id) ?? [];
      list.push({
        category_id: line.category_id,
        category_name: line.category_name,
        cashbox_name: m.cashbox_name,
        cashbox_code: m.cashbox_code,
        cashbox_kind: m.cashbox_kind,
        debit: m.debit,
        credit: m.credit,
      });
      peersByJournal.set(m.journal_id, list);
    }
  }

  return lines.map((line) => ({
    ...line,
    movements: line.movements.map((m) => {
      const peers = (peersByJournal.get(m.journal_id) ?? []).filter(
        (p) => p.category_id !== line.category_id,
      );
      return { ...m, contra_label: buildContraLabel(peers) };
    }),
  }));
}

/**
 * يبني قيود اليومية الكاملة من مجموعة بنود (كل قيد بكل أطرافه).
 * هذا هو العرض المهني الصحيح: مدين المصروف ودائن الخزينة في نفس القيد.
 */
export function buildPeriodJournalVouchers(
  lines: PeriodJournalLine[],
  focusCategoryId?: string | null,
): PeriodJournalVoucher[] {
  type Acc = {
    meta: {
      journal_id: string;
      journal_number: number;
      entry_date: string;
      journal_reference: string | null;
      journal_description: string | null;
    };
    lines: PeriodJournalVoucherLine[];
  };

  const byJournal = new Map<string, Acc>();

  for (const line of lines) {
    for (const m of line.movements) {
      let acc = byJournal.get(m.journal_id);
      if (!acc) {
        acc = {
          meta: {
            journal_id: m.journal_id,
            journal_number: m.journal_number,
            entry_date: m.entry_date,
            journal_reference: m.journal_reference,
            journal_description: m.journal_description,
          },
          lines: [],
        };
        byJournal.set(m.journal_id, acc);
      }
      acc.lines.push({
        category_id: line.category_id,
        category_code: line.category_code,
        category_name: line.category_name,
        category_type: line.category_type,
        cashbox_name: m.cashbox_name,
        cashbox_code: m.cashbox_code,
        cashbox_kind: m.cashbox_kind,
        contact_name: m.contact_name,
        line_description: m.line_description,
        debit: m.debit,
        credit: m.credit,
        is_focus: Boolean(focusCategoryId && line.category_id === focusCategoryId),
      });
    }
  }

  const vouchers: PeriodJournalVoucher[] = Array.from(byJournal.values()).map((acc) => {
    /** مدين أولاً ثم دائن — وأطراف البند المختار أولاً داخل كل جانب */
    const sortedLines = [...acc.lines].sort((a, b) => {
      if (a.is_focus !== b.is_focus) return a.is_focus ? -1 : 1;
      const aDebit = a.debit > EPS ? 0 : 1;
      const bDebit = b.debit > EPS ? 0 : 1;
      if (aDebit !== bDebit) return aDebit - bDebit;
      return (a.category_code || '').localeCompare(b.category_code || '', 'ar');
    });
    const totalDebit = sortedLines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = sortedLines.reduce((s, l) => s + l.credit, 0);
    return {
      ...acc.meta,
      lines: sortedLines,
      totalDebit,
      totalCredit,
      balanced: almostEqual(totalDebit, totalCredit),
    };
  });

  vouchers.sort((a, b) => {
    const d = a.entry_date.localeCompare(b.entry_date);
    if (d !== 0) return d;
    return a.journal_number - b.journal_number;
  });

  return vouchers;
}

/**
 * يدمج عدة صفوف بنود في صف مجمّع واحد (للإيرادات معاً أو المصاريف معاً).
 */
export function mergePeriodJournalLines(
  lines: PeriodJournalLine[],
  meta: {
    id: string;
    code: string;
    name_ar: string;
    type: string;
  },
): PeriodJournalLine {
  const debit = lines.reduce((s, l) => s + l.debit, 0);
  const credit = lines.reduce((s, l) => s + l.credit, 0);
  const movements = lines
    .flatMap((l) => l.movements)
    .slice()
    .sort((a, b) => {
      const d = a.entry_date.localeCompare(b.entry_date);
      if (d !== 0) return d;
      return a.journal_number - b.journal_number;
    });

  return {
    category_id: meta.id,
    category_code: meta.code,
    category_name: meta.name_ar,
    category_type: meta.type,
    cashbox_id: null,
    cashbox_name: null,
    cashbox_kind: null,
    rowKey: meta.id,
    debit,
    credit,
    net: debit - credit,
    movements,
  };
}

/**
 * طيّ بنود الإيراد معاً وبنود المصروف معاً — مع الإبقاء على الأصول/الخصوم/حقوق الملكية
 * (مثل الخزائن) كما هي حتى يبقى القيد متوازناً.
 */
export function collapsePeriodJournalLinesByAccountType(
  lines: PeriodJournalLine[],
): PeriodJournalLine[] {
  const revenues = lines.filter((l) => l.category_type === 'REVENUE');
  const expenses = lines.filter((l) => l.category_type === 'EXPENSE');
  const others = lines.filter(
    (l) => l.category_type !== 'REVENUE' && l.category_type !== 'EXPENSE',
  );

  const result = [...others];
  if (revenues.length > 0) {
    const meta = periodJournalTypeFilterMeta('REVENUE');
    result.push(
      mergePeriodJournalLines(revenues, {
        id: 'agg:REVENUE',
        code: meta.code,
        name_ar: meta.name_ar,
        type: 'REVENUE',
      }),
    );
  }
  if (expenses.length > 0) {
    const meta = periodJournalTypeFilterMeta('EXPENSE');
    result.push(
      mergePeriodJournalLines(expenses, {
        id: 'agg:EXPENSE',
        code: meta.code,
        name_ar: meta.name_ar,
        type: 'EXPENSE',
      }),
    );
  }
  return sortPeriodLines(result);
}

/**
 * تصفية القيد لبند محاسبي واحد — أو تجميع حسب النوع — أو إرجاع الكل.
 *
 * عند اختيار بند:
 * - نُظهر كل أطراف القيود التي لمسها البند (مصروف + خزينة + …)
 * - المبالغ تبقى حقيقية على كل بند (لا نسخ دائن الخزينة داخل بند المصروف)
 * - vouchers = كل قيد يومية كامل حتى يظهر مدين = دائن بوضوح
 *
 * عند group:type:
 * - جميع الإيرادات صف واحد + جميع المصاريف صف واحد + بقية الحسابات كما هي
 *
 * عند type:REVENUE / type:EXPENSE:
 * - صف تركيز واحد لكل النوع مع أطرافه المقابلة من نفس القيود
 */
export function applyPeriodJournalCategoryFilter(
  model: PeriodJournalEntryModel,
  categoryId: string | null | undefined,
  categoryMeta?: CategoryFilterMeta | null,
): PeriodJournalEntryModel {
  if (!categoryId || categoryId === 'all') {
    const lines = attachContraLabels(model.lines);
    return {
      ...model,
      categoryFilter: null,
      typeGroupFilter: null,
      title: `قيد الفترة الشامل — ${model.periodLabel}`,
      description: `كل البنود خلال ${model.periodLabel} — مجاميع ثم مجموع كل بند`,
      lines,
      vouchers: [],
    };
  }

  if (isPeriodJournalGroupByType(categoryId)) {
    const collapsed = collapsePeriodJournalLinesByAccountType(model.lines);
    const lines = attachContraLabels(collapsed);
    const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
    return {
      ...model,
      categoryFilter: null,
      typeGroupFilter: {
        mode: 'group',
        accountType: null,
        name_ar: 'إيرادات ومصاريف مجمّعة',
      },
      title: `قيد الفترة — إيرادات ومصاريف مجمّعة — ${model.periodLabel}`,
      description: `جميع بنود الإيراد معاً وجميع بنود المصروف معاً خلال ${model.periodLabel}`,
      lines,
      vouchers: [],
      totalDebit,
      totalCredit,
      balanced: almostEqual(totalDebit, totalCredit),
    };
  }

  const typeFilter = parsePeriodJournalTypeFilter(categoryId);
  if (typeFilter) {
    const meta = periodJournalTypeFilterMeta(typeFilter);
    const focusRows = model.lines.filter((l) => l.category_type === typeFilter);

    if (focusRows.length === 0) {
      return {
        ...model,
        categoryFilter: {
          id: meta.id,
          code: meta.code,
          name_ar: meta.name_ar,
        },
        typeGroupFilter: {
          mode: 'type',
          accountType: typeFilter,
          name_ar: meta.name_ar,
        },
        lines: [],
        vouchers: [],
        totalDebit: 0,
        totalCredit: 0,
        balanced: true,
        title: `كشف ${meta.name_ar}`,
        description: `لا حركة على ${meta.name_ar} خلال ${model.periodLabel}`,
      };
    }

    const journalIds = new Set(
      focusRows.flatMap((row) => row.movements.map((m) => m.journal_id)),
    );

    if (typeFilter === 'REVENUE') {
      for (const id of findCashReceivableCollectionJournalIds(model, journalIds)) {
        journalIds.add(id);
      }
    }

    const relatedOther: PeriodJournalLine[] = [];
    for (const line of model.lines) {
      if (line.category_type === typeFilter) continue;
      const movements = line.movements.filter((m) => journalIds.has(m.journal_id));
      if (movements.length === 0) continue;
      const debit = movements.reduce((s, m) => s + m.debit, 0);
      const credit = movements.reduce((s, m) => s + m.credit, 0);
      relatedOther.push({
        ...line,
        debit,
        credit,
        net: debit - credit,
        movements,
      });
    }

    /** مجموع فقط — صف واحد لجميع المصاريف/الإيرادات بلا تفصيل البنود */
    const focusMerged = mergePeriodJournalLines(focusRows, {
      id: meta.id,
      code: meta.code,
      name_ar: meta.name_ar,
      type: typeFilter,
    });

    const withLabels = attachContraLabels([
      focusMerged,
      ...sortPeriodLines(relatedOther),
    ]).filter((l) => !isReceivableAccountLine(l));

    const vouchers = buildPeriodJournalVouchers(withLabels, meta.id);
    const focusAmount = withLabels
      .filter((l) => l.category_id === meta.id)
      .reduce((s, l) => s + Math.max(l.debit, l.credit), 0);
    const totalDebit =
      typeFilter === 'REVENUE'
        ? focusAmount
        : withLabels.reduce((s, l) => s + l.debit, 0);
    const totalCredit =
      typeFilter === 'REVENUE'
        ? focusAmount
        : withLabels.reduce((s, l) => s + l.credit, 0);

    return {
      ...model,
      categoryFilter: {
        id: meta.id,
        code: meta.code,
        name_ar: meta.name_ar,
      },
      typeGroupFilter: {
        mode: 'type',
        accountType: typeFilter,
        name_ar: meta.name_ar,
      },
      lines: withLabels,
      vouchers,
      totalDebit,
      totalCredit,
      balanced: almostEqual(totalDebit, totalCredit),
      sourceEntryCount: journalIds.size,
      sourceLineCount: withLabels.reduce((s, l) => s + l.movements.length, 0),
      title: `كشف ${meta.name_ar}`,
      description: `مجموع ${meta.name_ar} فقط بلا تفصيل — مدين واضح، والنقدي/كل مصرف دائن بورقة · ${model.periodLabel}`,
    };
  }

  /** قد يكون البند مقسوماً على عدة خزائن — نأخذ كل الصفوف لنفس category_id */
  const focusRows = model.lines.filter((l) => l.category_id === categoryId);
  const existing = focusRows[0];

  const categoryFilter =
    existing != null
      ? {
          id: existing.category_id,
          code: existing.category_code,
          name_ar: existing.category_name,
        }
      : categoryMeta
        ? {
            id: categoryMeta.id,
            code: categoryMeta.code,
            name_ar: categoryMeta.name_ar,
          }
        : null;

  if (!existing) {
    return {
      ...model,
      categoryFilter,
      typeGroupFilter: null,
      lines: [],
      vouchers: [],
      totalDebit: 0,
      totalCredit: 0,
      balanced: true,
      title: categoryFilter
        ? `كشف بند — ${categoryFilter.name_ar}`
        : model.title,
      description: categoryFilter
        ? `لا حركة على ${categoryFilter.name_ar} خلال ${model.periodLabel}`
        : model.description,
    };
  }

  const journalIds = new Set(
    focusRows.flatMap((row) => row.movements.map((m) => m.journal_id)),
  );

  /** تحصيل إيجار: القيد المخزّن مدين خزينة/مصرف + دائن ذمم — يُضمّ للعرض */
  if (isCreditNormalAccountType(existing.category_type)) {
    for (const id of findCashReceivableCollectionJournalIds(model, journalIds)) {
      journalIds.add(id);
    }
  }

  const relatedLines: PeriodJournalLine[] = [];
  for (const line of model.lines) {
    const movements = line.movements.filter((m) => journalIds.has(m.journal_id));
    if (movements.length === 0) continue;
    const debit = movements.reduce((s, m) => s + m.debit, 0);
    const credit = movements.reduce((s, m) => s + m.credit, 0);
    relatedLines.push({
      ...line,
      debit,
      credit,
      net: debit - credit,
      movements,
    });
  }

  const withLabels = attachContraLabels(relatedLines);

  /** صفوف البند المختار (كل خزينة على حدة) أولاً، ثم بقية الأطراف — بدون ذمم */
  const focusFirst = [
    ...withLabels.filter((l) => l.category_id === categoryId),
    ...sortPeriodLines(withLabels.filter((l) => l.category_id !== categoryId)),
  ].filter((l) => !isReceivableAccountLine(l));

  const vouchers = buildPeriodJournalVouchers(focusFirst, categoryId);
  const focusAmount = focusFirst
    .filter((l) => l.category_id === categoryId)
    .reduce((s, l) => s + Math.max(l.debit, l.credit), 0);
  const totalDebit = isCreditNormalAccountType(existing.category_type)
    ? focusAmount
    : focusFirst.reduce((s, l) => s + l.debit, 0);
  const totalCredit = isCreditNormalAccountType(existing.category_type)
    ? focusAmount
    : focusFirst.reduce((s, l) => s + l.credit, 0);

  return {
    ...model,
    categoryFilter,
    typeGroupFilter: null,
    lines: focusFirst,
    vouchers,
    totalDebit,
    totalCredit,
    balanced: almostEqual(totalDebit, totalCredit),
    sourceEntryCount: journalIds.size,
    sourceLineCount: focusFirst.reduce((s, l) => s + l.movements.length, 0),
    title: categoryFilter
      ? `كشف بند — ${categoryFilter.name_ar}`
      : model.title,
    description: categoryFilter
      ? `إيراد محصّل حسب الخزينة/المصرف — «${categoryFilter.name_ar}» · ${model.periodLabel}`
      : model.description,
  };
}

type PeriodRpcLineRow = {
  journal_id: string;
  journal_number: number;
  entry_date: string;
  journal_reference: string | null;
  journal_description: string | null;
  journal_status: string;
  category_id: string;
  category_code: string | null;
  category_name: string | null;
  category_type: string | null;
  debit: number | string;
  credit: number | string;
  description: string | null;
  sort_order: number | null;
  cashbox_id: string | null;
  cashbox_name_ar: string | null;
  cashbox_code: string | null;
  cashbox_kind: string | null;
  contact_name: string | null;
};

function stubJournalEntryFromRpc(row: PeriodRpcLineRow): JournalEntryRow {
  return {
    id: row.journal_id,
    number: Number(row.journal_number) || 0,
    reference: row.journal_reference,
    status: (row.journal_status as JournalStatus) || 'POSTED',
    entry_date: row.entry_date,
    description: row.journal_description,
    notes: null,
    posted_at: null,
    reversed_at: null,
    created_at: row.entry_date,
    updated_at: row.entry_date,
    total_debit: '0',
    total_credit: '0',
    line_count: 0,
  };
}

async function enrichRawLinesCashboxKinds(allLines: RawLine[]): Promise<RawLine[]> {
  const supabase = createSupabaseBrowserClient();
  const cashboxIds = [
    ...new Set(
      allLines
        .map((l) => l.cashbox_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ];

  if (cashboxIds.length === 0) return allLines;

  const kindById = new Map<string, CashboxKind>();
  const boxChunk = 100;
  for (let i = 0; i < cashboxIds.length; i += boxChunk) {
    const slice = cashboxIds.slice(i, i + boxChunk);
    const { data: boxes, error: boxesError } = await supabase
      .from('cashboxes')
      .select('id, kind, name_ar, code')
      .in('id', slice);

    if (boxesError) {
      console.warn('[period-journal] cashbox kind lookup failed', boxesError);
      continue;
    }
    if (!boxes?.length) continue;
    for (const b of boxes) {
      if (b.id && b.kind) {
        kindById.set(b.id as string, b.kind as CashboxKind);
      }
      if (b.id && b.name_ar) {
        for (const line of allLines) {
          if (line.cashbox_id === b.id) {
            if (!line.cashbox_name_ar) line.cashbox_name_ar = b.name_ar as string;
            if (!line.cashbox_code && b.code) {
              line.cashbox_code = b.code as string;
            }
          }
        }
      }
    }
  }

  for (const line of allLines) {
    if (!line.cashbox_id) continue;
    line.cashbox_kind =
      kindById.get(line.cashbox_id) ??
      resolveCashboxKind({
        kind: line.cashbox_kind,
        code: line.cashbox_code,
        name: line.cashbox_name_ar,
      });
  }

  return allLines;
}

async function fetchRawLinesForJournalIds(ids: string[]): Promise<RawLine[]> {
  if (ids.length === 0) return [];
  const supabase = createSupabaseBrowserClient();
  const allLines: RawLine[] = [];
  const chunkSize = 80;

  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    let { data, error } = await supabase
      .from('journal_lines_with_categories')
      .select(
        'journal_id, category_id, debit, credit, description, category_code, category_name, category_type, cashbox_id, cashbox_name_ar, cashbox_code, cashbox_kind, contact_name, sort_order',
      )
      .in('journal_id', chunk)
      .order('sort_order', { ascending: true });

    if (error) {
      const fallback = await supabase
        .from('journal_lines_with_categories')
        .select(
          'journal_id, category_id, debit, credit, description, category_code, category_name, category_type, cashbox_id, cashbox_name_ar, cashbox_code, contact_name, sort_order',
        )
        .in('journal_id', chunk)
        .order('sort_order', { ascending: true });
      if (fallback.error) throw error;
      data = (fallback.data ?? []).map((row) => ({
        ...row,
        cashbox_kind: null as CashboxKind | null,
      })) as typeof data;
      error = null;
    }

    allLines.push(
      ...((data ?? []).map((row) => {
        const base = row as RawLine;
        return {
          ...base,
          cashbox_kind: resolveCashboxKind({
            kind: base.cashbox_kind,
            code: base.cashbox_code,
            name: base.cashbox_name_ar,
          }),
        } as RawLine;
      })),
    );
  }

  return enrichRawLinesCashboxKinds(allLines);
}

const PERIOD_LINES_PAGE = 5000;

function mapPeriodRpcRowsToModel(
  period: ReportPeriod,
  status: JournalStatus | 'ALL',
  rows: PeriodRpcLineRow[],
): Promise<PeriodJournalEntryModel> {
  const entriesById = new Map<string, JournalEntryRow>();
  const lines: RawLine[] = [];
  for (const row of rows) {
    if (!entriesById.has(row.journal_id)) {
      entriesById.set(row.journal_id, stubJournalEntryFromRpc(row));
    }
    lines.push({
      journal_id: row.journal_id,
      category_id: row.category_id,
      debit: Number(row.debit) || 0,
      credit: Number(row.credit) || 0,
      description: row.description,
      category_code: row.category_code,
      category_name: row.category_name,
      category_type: row.category_type,
      cashbox_id: row.cashbox_id,
      cashbox_name_ar: row.cashbox_name_ar,
      cashbox_code: row.cashbox_code,
      cashbox_kind: resolveCashboxKind({
        kind: row.cashbox_kind as CashboxKind | null,
        code: row.cashbox_code,
        name: row.cashbox_name_ar,
      }),
      contact_name: row.contact_name,
      sort_order: Number(row.sort_order) || 0,
    });
  }

  return enrichRawLinesCashboxKinds(lines).then((enriched) =>
    buildPeriodJournalEntryModel({
      period,
      entries: [...entriesById.values()],
      lines: enriched,
      statusFilter: status,
      truncated: false,
    }),
  );
}

/** يجلب كل بنود الفترة عبر ترقيم offset حتى نفاد الصفحات — بلا سقف إجمالي. */
async function fetchAllPeriodJournalLinesPaged(input: {
  startDate: string;
  endDate: string;
  statusFilter?: JournalStatus | 'ALL';
  categoryId?: string | null;
}): Promise<{ rows: PeriodRpcLineRow[]; rpcAvailable: boolean }> {
  const supabase = createSupabaseBrowserClient();
  const status = input.statusFilter ?? 'POSTED';
  const rows: PeriodRpcLineRow[] = [];
  let offset = 0;
  let rpcAvailable = true;

  for (;;) {
    const { data, error } = await supabase.rpc('get_journal_lines_for_period', {
      p_start_date: input.startDate,
      p_end_date: input.endDate,
      p_status: status,
      p_category_id: input.categoryId ?? null,
      p_limit: PERIOD_LINES_PAGE,
      p_offset: offset,
    });

    if (error) {
      const msg = error.message ?? '';
      const offsetUnsupported =
        msg.includes('p_offset') ||
        msg.includes('Could not find') ||
        error.code === 'PGRST202';

      if (offsetUnsupported && offset === 0) {
        const legacy = await supabase.rpc('get_journal_lines_for_period', {
          p_start_date: input.startDate,
          p_end_date: input.endDate,
          p_status: status,
          p_category_id: input.categoryId ?? null,
          p_limit: PERIOD_LINES_PAGE,
        });
        if (legacy.error) {
          const lmsg = legacy.error.message ?? '';
          const missing =
            lmsg.includes('get_journal_lines_for_period') ||
            lmsg.includes('schema cache') ||
            lmsg.includes('structure of query') ||
            lmsg.includes('does not match') ||
            legacy.error.code === 'PGRST202' ||
            legacy.error.code === '42804';
          if (missing) {
            rpcAvailable = false;
            return { rows: [], rpcAvailable: false };
          }
          throw legacy.error;
        }
        const legacyRows = (legacy.data as PeriodRpcLineRow[]) ?? [];
        if (legacyRows.length >= PERIOD_LINES_PAGE) {
          throw new Error(
            'تعذّر جلب كل بنود الفترة: حدّث ترحيل get_journal_lines_for_period (offset)',
          );
        }
        return { rows: legacyRows, rpcAvailable: true };
      }
      if (offsetUnsupported) {
        throw new Error(
          'توقف ترقيم بنود الفترة قبل الاكتمال — أعد تحميل الصفحة، وإن تكرر أبلغ مسؤول النظام.',
        );
      }
      throw error;
    }

    const page = (data as PeriodRpcLineRow[]) ?? [];
    rows.push(...page);
    if (page.length < PERIOD_LINES_PAGE) break;
    offset += PERIOD_LINES_PAGE;
  }

  return { rows, rpcAvailable };
}

async function fetchCategoryMetaById(
  categoryId: string,
): Promise<{
  id: string;
  code: string;
  name_ar: string;
  type: string | null;
  kind: string | null;
} | null> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('categories')
    .select('id, code, name_ar, type, kind')
    .eq('id', categoryId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id as string,
    code: (data.code as string) || '',
    name_ar: (data.name_ar as string) || '',
    type: (data.type as string) || null,
    kind: (data.kind as string) || null,
  };
}

/** قيود تحصيل معاملات الإيراد لهذا البند في الفترة (مدين خزينة / دائن ذمم). */
async function fetchRevenueCollectionJournalIds(input: {
  categoryId: string;
  startDate: string;
  endDate: string;
  statusFilter: JournalStatus | 'ALL';
}): Promise<string[]> {
  const supabase = createSupabaseBrowserClient();
  const pageSize = 1000;
  const txIds: string[] = [];
  let from = 0;

  for (;;) {
    let q = supabase
      .from('transactions')
      .select('id')
      .eq('category_id', input.categoryId)
      .eq('kind', 'REVENUE')
      .gte('tx_date', input.startDate)
      .lte('tx_date', input.endDate)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    /** حالات القيود لا تطابق كلها حالات المعاملات — التحصيل المرحّل هو المسار الافتراضي */
    if (input.statusFilter === 'POSTED' || input.statusFilter === 'ALL') {
      if (input.statusFilter === 'POSTED') q = q.eq('status', 'POSTED');
    } else {
      return [];
    }
    const { data, error } = await q;
    if (error) throw error;
    const chunk = (data ?? []) as Array<{ id: string }>;
    txIds.push(...chunk.map((r) => r.id));
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  if (txIds.length === 0) return [];

  const journalIds = new Set<string>();
  const idChunk = 80;
  for (let i = 0; i < txIds.length; i += idChunk) {
    const slice = txIds.slice(i, i + idChunk);
    let q = supabase
      .from('journal_entries')
      .select('id')
      .eq('source_type', 'TRANSACTION')
      .in('source_id', slice);
    if (input.statusFilter !== 'ALL') {
      q = q.eq('status', input.statusFilter);
    }
    const { data, error } = await q;
    if (error) throw error;
    for (const row of data ?? []) {
      if (row.id) journalIds.add(row.id as string);
    }
  }
  return [...journalIds];
}

async function fetchJournalEntriesByIds(
  journalIds: string[],
): Promise<JournalEntryRow[]> {
  if (journalIds.length === 0) return [];
  const supabase = createSupabaseBrowserClient();
  const entries: JournalEntryRow[] = [];
  const idChunk = 80;
  for (let i = 0; i < journalIds.length; i += idChunk) {
    const chunk = journalIds.slice(i, i + idChunk);
    const { data: jeRows, error: jeError } = await supabase
      .from('journal_entries_with_totals')
      .select('*')
      .in('id', chunk);
    if (jeError) throw jeError;
    entries.push(...((jeRows as JournalEntryRow[]) ?? []));
  }
  return entries;
}

/**
 * يعيد كتابة قيد التحصيل (مدين نقدي / دائن ذمم) كعرض: مدين نقدي / دائن بند الإيراد،
 * ليظهر الطرف النقدي في كشف البند دون تغيير القيود المخزّنة.
 */
function rewriteCollectionLinesAsCashRevenue(
  lines: RawLine[],
  collectionJournalIds: Set<string>,
  category: { id: string; code: string; name_ar: string; type: string | null },
): RawLine[] {
  if (collectionJournalIds.size === 0) return lines;
  const byJournal = new Map<string, RawLine[]>();
  for (const line of lines) {
    const list = byJournal.get(line.journal_id) ?? [];
    list.push(line);
    byJournal.set(line.journal_id, list);
  }

  const out: RawLine[] = [];
  for (const [journalId, jLines] of byJournal) {
    if (!collectionJournalIds.has(journalId)) {
      out.push(...jLines);
      continue;
    }
    if (
      jLines.some(
        (l) =>
          l.category_id === category.id && (Number(l.credit) || 0) > EPS,
      )
    ) {
      out.push(...jLines);
      continue;
    }
    const cashDebits = jLines.filter(
      (l) => l.cashbox_id && (Number(l.debit) || 0) > EPS,
    );
    const cashTotal = cashDebits.reduce(
      (s, l) => s + (Number(l.debit) || 0),
      0,
    );
    if (cashTotal <= EPS) {
      out.push(...jLines);
      continue;
    }
    out.push(...cashDebits);
    out.push({
      journal_id: journalId,
      category_id: category.id,
      debit: 0,
      credit: cashTotal,
      description: null,
      category_code: category.code,
      category_name: category.name_ar,
      category_type: category.type ?? 'REVENUE',
      cashbox_id: null,
      cashbox_name_ar: null,
      cashbox_code: null,
      cashbox_kind: null,
      contact_name: null,
      sort_order: 900,
    });
  }
  return out;
}

function journalIdsFromPeriodModel(model: PeriodJournalEntryModel): string[] {
  const ids = new Set<string>();
  for (const line of model.lines) {
    for (const m of line.movements) ids.add(m.journal_id);
  }
  return [...ids];
}

type RevenueCollectionFocusMeta = {
  id: string;
  code: string;
  name_ar: string;
  type: string;
};

/**
 * تحصيل إيجار (مدين خزينة / دائن ذمم) لا يحمل سطر بند الإيراد في القيد المخزّن —
 * يُضاف لأقسام النقدي/المصرف مثل المصروف.
 */
function augmentRevenueCollectionCashBuckets(
  model: PeriodJournalEntryModel,
  excludeJournalIds: Set<string>,
  assignJournalToFundingBucket: (journalId: string) => void,
  focusMeta: RevenueCollectionFocusMeta,
): PeriodJournalLine[] {
  const collectionIds = findCashReceivableCollectionJournalIds(
    model,
    excludeJournalIds,
  );
  for (const journalId of collectionIds) {
    assignJournalToFundingBucket(journalId);
  }
  if (collectionIds.size === 0) return [];
  const synthetic = buildSyntheticRevenueFocusFromCollections(
    model,
    collectionIds,
    focusMeta,
  );
  return synthetic ? [synthetic] : [];
}

function journalHasReceivableDebit(
  model: PeriodJournalEntryModel,
  journalId: string,
): boolean {
  for (const line of model.lines) {
    if (!isReceivableAccountLine(line)) continue;
    for (const m of line.movements) {
      if (m.journal_id === journalId && m.debit > EPS) return true;
    }
  }
  return false;
}

/**
 * عند وجود تحصيل نقدي لإيجار: استبعد قيود الاستحقاق (دائن إيراد + مدين ذمم)
 * حتى لا يُجمع الاستحقاق + التحصيل في نفس التقرير.
 */
function findRevenueAccrualJournalIdsToSkip(
  model: PeriodJournalEntryModel,
  collectionIds: Set<string>,
  focusCategoryId?: string | null,
): Set<string> {
  const skip = new Set<string>();
  if (collectionIds.size === 0) return skip;
  for (const line of model.lines) {
    if (line.category_type !== 'REVENUE') continue;
    if (focusCategoryId && line.category_id !== focusCategoryId) continue;
    for (const m of line.movements) {
      if (m.credit <= EPS) continue;
      if (collectionIds.has(m.journal_id)) continue;
      if (journalHasReceivableDebit(model, m.journal_id)) {
        skip.add(m.journal_id);
      }
    }
  }
  return skip;
}

function filterRevenueFundingBuckets(
  buckets: FundingBucket[],
  collectionIds: Set<string>,
): FundingBucket[] {
  if (collectionIds.size === 0) return buckets;
  return buckets.filter((b) => b.kind !== 'NONE');
}

function findCashReceivableCollectionJournalIds(
  model: PeriodJournalEntryModel,
  excludeJournalIds: Set<string>,
): Set<string> {
  const hasCashDebit = new Set<string>();
  const hasReceivableCredit = new Set<string>();
  for (const line of model.lines) {
    const isReceivable =
      line.category_code === 'AST-REC' ||
      (line.category_type === 'ASSET' &&
        !line.cashbox_id &&
        /ذمم|receiv/i.test(line.category_name || ''));
    for (const m of line.movements) {
      if (excludeJournalIds.has(m.journal_id)) continue;
      if (line.cashbox_id && m.debit > EPS) hasCashDebit.add(m.journal_id);
      if (isReceivable && m.credit > EPS) hasReceivableCredit.add(m.journal_id);
    }
  }
  const out = new Set<string>();
  for (const id of hasCashDebit) {
    if (hasReceivableCredit.has(id)) out.add(id);
  }
  return out;
}

function buildSyntheticRevenueFocusFromCollections(
  model: PeriodJournalEntryModel,
  collectionIds: Set<string>,
  meta: { id: string; code: string; name_ar: string; type: string },
): PeriodJournalLine | null {
  const movements: PeriodJournalMovement[] = [];
  for (const line of model.lines) {
    if (!line.cashbox_id) continue;
    for (const m of line.movements) {
      if (!collectionIds.has(m.journal_id) || m.debit <= EPS) continue;
      movements.push({
        journal_id: m.journal_id,
        journal_number: m.journal_number,
        entry_date: m.entry_date,
        journal_reference: m.journal_reference,
        journal_description: m.journal_description,
        line_description: m.line_description,
        cashbox_id: null,
        cashbox_name: null,
        cashbox_code: null,
        cashbox_kind: null,
        contact_name: m.contact_name,
        debit: 0,
        credit: m.debit,
        contra_label: null,
      });
    }
  }
  if (movements.length === 0) return null;
  movements.sort((a, b) => {
    const d = a.entry_date.localeCompare(b.entry_date);
    if (d !== 0) return d;
    return a.journal_number - b.journal_number;
  });
  const credit = movements.reduce((s, m) => s + m.credit, 0);
  return {
    category_id: meta.id,
    category_code: meta.code,
    category_name: meta.name_ar,
    category_type: meta.type,
    cashbox_id: null,
    cashbox_name: null,
    cashbox_kind: null,
    rowKey: `${meta.id}::cash-collections`,
    debit: 0,
    credit,
    net: -credit,
    movements,
  };
}

/**
 * مسار بند واحد (مثل REV-RNT): يجلب قيود الاستحقاق + تحصيلات الخزينة/المصرف
 * في نموذج واحد — مجاميع الشهر مثل المصروف، كل خزينة بورقة.
 */
async function fetchPeriodJournalByCategory(input: {
  period: ReportPeriod;
  categoryId: string;
  statusFilter?: JournalStatus | 'ALL';
}): Promise<PeriodJournalEntryModel> {
  const { startDate, endDate } = reportPeriodDateRange(input.period);
  const status = input.statusFilter ?? 'POSTED';
  const categoryMeta = await fetchCategoryMetaById(input.categoryId);
  const isRevenueCategory =
    categoryMeta?.type === 'REVENUE' || categoryMeta?.kind === 'REVENUE';

  const accrualModel = await fetchPeriodJournalByCategoryAccrualPath({
    period: input.period,
    categoryId: input.categoryId,
    statusFilter: status,
  });

  if (!isRevenueCategory || !categoryMeta) {
    return accrualModel;
  }

  const collectionIds = await fetchRevenueCollectionJournalIds({
    categoryId: input.categoryId,
    startDate,
    endDate,
    statusFilter: status,
  });

  if (collectionIds.length === 0) {
    return accrualModel;
  }

  const accrualJournalIds = journalIdsFromPeriodModel(accrualModel);
  const hasAccrualFocus = accrualModel.lines.some(
    (l) =>
      l.category_id === input.categoryId &&
      (l.debit > EPS || l.credit > EPS),
  );

  const collectionIdSet = new Set(collectionIds);
  const collEntries = await fetchJournalEntriesByIds(collectionIds);
  const collLinesRaw = await fetchRawLinesForJournalIds(collectionIds);
  const collLinesRewritten = rewriteCollectionLinesAsCashRevenue(
    collLinesRaw,
    collectionIdSet,
    {
      id: categoryMeta.id,
      code: categoryMeta.code,
      name_ar: categoryMeta.name_ar,
      type: categoryMeta.type,
    },
  );

  /** عند وجود استحقاق + تحصيل: اعرض التحصيل النقدي فقط — لا تُجمع قيمتين */
  if (hasAccrualFocus) {
    const mergedLines = await enrichRawLinesCashboxKinds(collLinesRewritten);
    return buildPeriodJournalEntryModel({
      period: input.period,
      entries: collEntries,
      lines: mergedLines,
      statusFilter: status,
      truncated: accrualModel.truncated,
    });
  }

  const accrualLinesRaw =
    accrualJournalIds.length > 0
      ? await fetchRawLinesForJournalIds(accrualJournalIds)
      : [];
  const accrualEntries =
    accrualJournalIds.length > 0
      ? await fetchJournalEntriesByIds(accrualJournalIds)
      : [];

  const collLines = collLinesRewritten;

  const entryById = new Map<string, JournalEntryRow>();
  for (const e of [...accrualEntries, ...collEntries]) {
    entryById.set(e.id, e);
  }

  const mergedLines = await enrichRawLinesCashboxKinds([
    ...accrualLinesRaw,
    ...collLines,
  ]);

  return buildPeriodJournalEntryModel({
    period: input.period,
    entries: [...entryById.values()],
    lines: mergedLines,
    statusFilter: status,
    truncated: accrualModel.truncated,
  });
}

async function fetchPeriodJournalByCategoryAccrualPath(input: {
  period: ReportPeriod;
  categoryId: string;
  statusFilter: JournalStatus | 'ALL';
}): Promise<PeriodJournalEntryModel> {
  const supabase = createSupabaseBrowserClient();
  const { startDate, endDate } = reportPeriodDateRange(input.period);
  const status = input.statusFilter;

  const { rows, rpcAvailable } = await fetchAllPeriodJournalLinesPaged({
    startDate,
    endDate,
    statusFilter: status,
    categoryId: input.categoryId,
  });

  if (rpcAvailable) {
    if (rows.length === 0) {
      return buildPeriodJournalEntryModel({
        period: input.period,
        entries: [],
        lines: [],
        statusFilter: status,
        truncated: false,
      });
    }
    return mapPeriodRpcRowsToModel(input.period, status, rows);
  }

  /** Fallback: دفتر الأستاذ للبند ثم توسيع القيود بالكامل */
  if (status !== 'POSTED' && status !== 'ALL') {
    throw new Error(
      'هذا الخيار غير متاح حالياً — اختر «قيود مرحّلة فقط» أو أبلغ مسؤول النظام.',
    );
  }

  const { data: glData, error: glError } = await supabase.rpc(
    'get_general_ledger_lines',
    {
      p_category_id: input.categoryId,
      p_start_date: startDate,
      p_end_date: endDate,
    },
  );

  if (glError) {
    const glMsg = glError.message ?? '';
    const glMissing =
      glMsg.includes('get_general_ledger_lines') ||
      glMsg.includes('schema cache') ||
      glError.code === 'PGRST202';
    if (!glMissing) throw glError;
    throw new Error('تعذّر جلب بنود البند — دوال التقارير غير متاحة');
  }

  const glLines =
    ((glData as { lines?: Array<{ journal_id?: string }> } | null)?.lines ??
      []) as Array<{ journal_id?: string }>;
  const journalIds = [
    ...new Set(
      glLines
        .map((l) => l.journal_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ];

  if (journalIds.length === 0) {
    return buildPeriodJournalEntryModel({
      period: input.period,
      entries: [],
      lines: [],
      statusFilter: status,
      truncated: false,
    });
  }

  const entries = await fetchJournalEntriesByIds(journalIds);
  const lines = await fetchRawLinesForJournalIds(journalIds);
  return buildPeriodJournalEntryModel({
    period: input.period,
    entries,
    lines,
    statusFilter: status,
    truncated: false,
  });
}

async function fetchAllPeriodJournalEntriesPaged(input: {
  startDate: string;
  endDate: string;
  statusFilter?: JournalStatus | 'ALL';
}): Promise<{ entries: JournalEntryRow[]; truncated: boolean }> {
  const supabase = createSupabaseBrowserClient();
  const status = input.statusFilter ?? 'POSTED';
  const pageSize = 5000;
  const entries: JournalEntryRow[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase.rpc('get_journal_entries_for_period', {
      p_start_date: input.startDate,
      p_end_date: input.endDate,
      p_status: status,
      p_limit: pageSize,
      p_offset: offset,
    });

    if (error) {
      const msg = error.message ?? '';
      const offsetUnsupported =
        msg.includes('p_offset') ||
        (msg.includes('Could not find') && msg.includes('p_offset')) ||
        error.code === 'PGRST202';

      if (offsetUnsupported && offset === 0) {
        /** ترقيم من الـ view مباشرة بلا سقف إجمالي */
        const viewRows: JournalEntryRow[] = [];
        let viewOffset = 0;
        for (;;) {
          let q = supabase
            .from('journal_entries_with_totals')
            .select('*')
            .gte('entry_date', input.startDate)
            .lte('entry_date', input.endDate)
            .order('entry_date', { ascending: true })
            .order('number', { ascending: true })
            .range(viewOffset, viewOffset + pageSize - 1);
          if (status !== 'ALL') q = q.eq('status', status);
          const { data: page, error: viewError } = await q;
          if (viewError) throw viewError;
          const chunk = (page as JournalEntryRow[]) ?? [];
          viewRows.push(...chunk);
          if (chunk.length < pageSize) break;
          viewOffset += pageSize;
        }
        return { entries: viewRows, truncated: false };
      }
      if (offsetUnsupported) {
        throw new Error(
          'توقف ترقيم القيود قبل الاكتمال — أعد المحاولة، وإن تكرر أبلغ مسؤول النظام.',
        );
      }
      throw error;
    }

    const rows = (data as JournalEntryRow[]) ?? [];
    entries.push(...rows);
    if (rows.length < pageSize) break;
    offset += pageSize;
  }

  return { entries, truncated: false };
}

/**
 * جلب بنود الفترة وتجميعها كقيد واحد.
 * عند تمرير categoryId (بند مثل إيجارات المحلات) يُجلب كل قيود البند
 * بترقيم كامل بلا سقف إجمالي.
 */
export async function fetchPeriodJournalEntry(input: {
  period: ReportPeriod;
  entries?: JournalEntryRow[];
  statusFilter?: JournalStatus | 'ALL';
  /** بند تركيز — مسار كامل بلا قطع */
  categoryId?: string | null;
}): Promise<PeriodJournalEntryModel> {
  const status = input.statusFilter ?? 'POSTED';
  const { startDate, endDate } = reportPeriodDateRange(input.period);

  if (input.categoryId) {
    return fetchPeriodJournalByCategory({
      period: input.period,
      categoryId: input.categoryId,
      statusFilter: status,
    });
  }

  const { rows, rpcAvailable } = await fetchAllPeriodJournalLinesPaged({
    startDate,
    endDate,
    statusFilter: status,
    categoryId: null,
  });

  if (rpcAvailable) {
    if (rows.length === 0) {
      return buildPeriodJournalEntryModel({
        period: input.period,
        entries: [],
        lines: [],
        statusFilter: status,
        truncated: false,
      });
    }
    return mapPeriodRpcRowsToModel(input.period, status, rows);
  }

  let entries = input.entries;
  let truncated = false;
  if (!entries) {
    const paged = await fetchAllPeriodJournalEntriesPaged({
      startDate,
      endDate,
      statusFilter: status,
    });
    entries = paged.entries;
    truncated = paged.truncated;
  }

  if (entries.length === 0) {
    return buildPeriodJournalEntryModel({
      period: input.period,
      entries: [],
      lines: [],
      statusFilter: status,
      truncated: false,
    });
  }

  const lines = await fetchRawLinesForJournalIds(entries.map((e) => e.id));
  return buildPeriodJournalEntryModel({
    period: input.period,
    entries,
    lines,
    statusFilter: status,
    truncated,
  });
}
