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
 * قسم تقرير عند اختيار بند: النقدي مجمّعاً، وكل مصرف في صفحة مستقلة.
 * المصروف/الأصل: البند مدين والطرف المقابل دائن.
 * الإيراد/الالتزام/حقوق الملكية: البند دائن والطرف المقابل مدين.
 */
export type PeriodCashBankSection = {
  sectionKey: string;
  sectionKind: 'CASH' | 'BANK' | 'CARD' | 'OTHER' | 'NONE';
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

/** اسم الطرف المقابل للعرض (نقدي / مصرف / ذمم / …) */
export function resolvePeriodJournalContraLabel(
  contraLines: PeriodJournalLine[],
  options?: {
    fundingLabel?: string | null;
    sectionKind?: PeriodCashBankSection['sectionKind'];
  },
): string {
  const funding = options?.fundingLabel?.trim();
  if (funding && funding !== '—') return funding;
  if (options?.sectionKind === 'CASH') return 'النقدي';
  if (options?.sectionKind === 'BANK') return 'المصرف';
  if (contraLines.length === 0) return 'الطرف المقابل';
  const names = [
    ...new Set(
      contraLines
        .map((l) => l.cashbox_name?.trim() || l.category_name)
        .filter((n): n is string => Boolean(n && n !== '—')),
    ),
  ];
  if (names.length === 0) return 'الطرف المقابل';
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

export type PeriodJournalAccountTypeFilter = 'REVENUE' | 'EXPENSE';

export function isPeriodJournalGroupByType(
  filter: string | null | undefined,
): boolean {
  return filter === PERIOD_JOURNAL_GROUP_BY_TYPE;
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

/** يدمج صفوف النقدي في صف واحد بالمجاميع فقط */
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
  return sortPeriodLines(related);
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
  for (const line of model.lines) {
    for (const m of line.movements) {
      if (m.journal_id !== journalId) continue;
      if (!m.cashbox_name && !line.cashbox_id && !m.cashbox_code) continue;
      const kind = resolveMovementCashboxKind(m) ?? line.cashbox_kind;
      return {
        cashbox_id: line.cashbox_id,
        cashbox_name: m.cashbox_name ?? line.cashbox_name,
        cashbox_code: m.cashbox_code,
        cashbox_kind: kind,
      };
    }
  }
  return null;
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

  type Bucket = {
    key: string;
    kind: PeriodCashBankSection['sectionKind'];
    fundingLabel: string;
    journalIds: Set<string>;
    cashbox_id: string | null;
    cashbox_name: string | null;
    cashbox_kind: CashboxKind | null;
  };

  const cashBucket: Bucket = {
    key: `${meta.id}::kind:CASH`,
    kind: 'CASH',
    fundingLabel: 'النقدي',
    journalIds: new Set(),
    cashbox_id: null,
    cashbox_name: 'النقدي',
    cashbox_kind: 'CASH',
  };
  const bankBuckets = new Map<string, Bucket>();
  const otherBuckets = new Map<string, Bucket>();
  const noneBucket: Bucket = {
    key: `${meta.id}::kind:NONE`,
    kind: 'NONE',
    fundingLabel: '—',
    journalIds: new Set(),
    cashbox_id: null,
    cashbox_name: null,
    cashbox_kind: null,
  };

  const allMovements = focusRows.flatMap((r) => r.movements);
  for (const m of allMovements) {
    const boxMeta = journalCashboxMetaFromModel(model, m.journal_id);
    const kind =
      boxMeta?.cashbox_kind ??
      resolveCashboxKind({
        code: boxMeta?.cashbox_code,
        name: boxMeta?.cashbox_name,
      });

    if (kind === 'CASH') {
      cashBucket.journalIds.add(m.journal_id);
      continue;
    }
    if (kind === 'BANK') {
      const bankKey =
        boxMeta?.cashbox_id ||
        boxMeta?.cashbox_code ||
        boxMeta?.cashbox_name ||
        `bank-${m.journal_id}`;
      let bucket = bankBuckets.get(bankKey);
      if (!bucket) {
        bucket = {
          key: `${meta.id}::cb:${bankKey}`,
          kind: 'BANK',
          fundingLabel: boxMeta?.cashbox_name?.trim() || 'حساب مصرفي',
          journalIds: new Set(),
          cashbox_id: boxMeta?.cashbox_id ?? null,
          cashbox_name: boxMeta?.cashbox_name ?? null,
          cashbox_kind: 'BANK',
        };
        bankBuckets.set(bankKey, bucket);
      }
      bucket.journalIds.add(m.journal_id);
      continue;
    }
    if (kind === 'CARD' || kind === 'OTHER') {
      const otherKey =
        boxMeta?.cashbox_id ||
        boxMeta?.cashbox_code ||
        boxMeta?.cashbox_name ||
        `other-${m.journal_id}`;
      let bucket = otherBuckets.get(otherKey);
      if (!bucket) {
        bucket = {
          key: `${meta.id}::cb:${otherKey}`,
          kind: kind === 'CARD' ? 'CARD' : 'OTHER',
          fundingLabel: boxMeta?.cashbox_name?.trim() || 'خزينة أخرى',
          journalIds: new Set(),
          cashbox_id: boxMeta?.cashbox_id ?? null,
          cashbox_name: boxMeta?.cashbox_name ?? null,
          cashbox_kind: kind,
        };
        otherBuckets.set(otherKey, bucket);
      }
      bucket.journalIds.add(m.journal_id);
      continue;
    }
    noneBucket.journalIds.add(m.journal_id);
  }

  const orderedBuckets: Bucket[] = [];
  if (cashBucket.journalIds.size > 0) orderedBuckets.push(cashBucket);
  orderedBuckets.push(
    ...[...bankBuckets.values()].sort((a, b) =>
      a.fundingLabel.localeCompare(b.fundingLabel, 'ar'),
    ),
  );
  orderedBuckets.push(
    ...[...otherBuckets.values()].sort((a, b) =>
      a.fundingLabel.localeCompare(b.fundingLabel, 'ar'),
    ),
  );
  if (noneBucket.journalIds.size > 0) orderedBuckets.push(noneBucket);

  if (orderedBuckets.length === 0) {
    const focusLine = mergePeriodJournalLines(focusRows, {
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
    const detailLines = focusRows
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

    if (bucket.kind === 'CASH') {
      contraLines = contraLines.filter(
        (l) => !l.cashbox_kind || l.cashbox_kind === 'CASH' || !l.cashbox_id,
      );
      const cashContras = contraLines.filter((l) => l.cashbox_kind === 'CASH');
      const otherContras = contraLines.filter((l) => l.cashbox_kind !== 'CASH');
      if (cashContras.length > 1) {
        contraLines = [
          {
            ...mergeCashFocusLines(cashContras),
            cashbox_name: 'النقدي',
            cashbox_kind: 'CASH',
          },
          ...otherContras,
        ];
      } else if (cashContras.length === 1) {
        contraLines = [
          {
            ...cashContras[0],
            cashbox_name: cashContras[0].cashbox_name || 'النقدي',
          },
          ...otherContras,
        ];
      }
    } else if (bucket.kind === 'BANK') {
      contraLines = contraLines.filter((l) => {
        if (l.cashbox_id && bucket.cashbox_id) {
          return l.cashbox_id === bucket.cashbox_id;
        }
        if (l.cashbox_kind === 'BANK' && bucket.cashbox_name) {
          return l.cashbox_name === bucket.cashbox_name;
        }
        return !l.cashbox_id || l.cashbox_kind === bucket.cashbox_kind;
      });
    }

    const contraLabel =
      bucket.kind === 'NONE'
        ? resolvePeriodJournalContraLabel(contraLines, {
            sectionKind: 'NONE',
          })
        : bucket.fundingLabel;

    sections.push({
      sectionKey: bucket.key,
      sectionKind: bucket.kind,
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
    const cashRows = focusRows.filter((l) => l.cashbox_kind === 'CASH');
    const bankRows = focusRows
      .filter((l) => l.cashbox_kind === 'BANK')
      .sort((a, b) =>
        (a.cashbox_name || '').localeCompare(b.cashbox_name || '', 'ar'),
      );
    const otherRows = focusRows
      .filter(
        (l) =>
          l.cashbox_id &&
          l.cashbox_kind !== 'CASH' &&
          l.cashbox_kind !== 'BANK',
      )
      .sort((a, b) =>
        (a.cashbox_name || '').localeCompare(b.cashbox_name || '', 'ar'),
      );
    const plainRows = focusRows.filter((l) => !l.cashbox_id);

    if (cashRows.length > 0) {
      const merged = mergeCashFocusLines(cashRows);
      const focusLine = asCategoryFocus(merged, merged.rowKey);
      const journalIds = new Set(focusLine.movements.map((m) => m.journal_id));
      const contraLines = buildContraLinesForJournals(
        model,
        focusLine,
        journalIds,
      );
      sections.push({
        sectionKey: focusLine.rowKey,
        sectionKind: 'CASH',
        title: categoryName,
        fundingLabel: 'النقدي',
        subtitle: makeSubtitle('النقدي'),
        focusLine,
        contraLines,
        ...sectionTotals(focusLine, contraLines),
      });
    }

    for (const bank of bankRows) {
      const funding = bank.cashbox_name?.trim() || 'حساب مصرفي';
      const focusLine = asCategoryFocus(bank, bank.rowKey);
      const contraLines = buildContraLinesForFocus(model, bank);
      sections.push({
        sectionKey: bank.rowKey,
        sectionKind: 'BANK',
        title: categoryName,
        fundingLabel: funding,
        subtitle: makeSubtitle(funding),
        focusLine,
        contraLines,
        ...sectionTotals(focusLine, contraLines),
      });
    }

    for (const row of otherRows) {
      const kind = row.cashbox_kind ?? 'OTHER';
      const funding = row.cashbox_name?.trim() || 'خزينة أخرى';
      const focusLine = asCategoryFocus(row, row.rowKey);
      const contraLines = buildContraLinesForFocus(model, row);
      sections.push({
        sectionKey: row.rowKey,
        sectionKind: kind === 'CARD' ? 'CARD' : 'OTHER',
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

  /** بند عادي (مصروف/إيراد…): قسّم حسب مصدر الدفع مع قطبية النوع (مدين/دائن) */
  const template = focusRows[0];
  const allMovements = focusRows.flatMap((r) => r.movements);

  type Bucket = {
    key: string;
    kind: PeriodCashBankSection['sectionKind'];
    fundingLabel: string;
    journalIds: Set<string>;
    cashbox_id: string | null;
    cashbox_name: string | null;
    cashbox_kind: CashboxKind | null;
  };

  const cashBucket: Bucket = {
    key: `${focusCategoryId}::kind:CASH`,
    kind: 'CASH',
    fundingLabel: 'النقدي',
    journalIds: new Set(),
    cashbox_id: null,
    cashbox_name: 'النقدي',
    cashbox_kind: 'CASH',
  };
  const bankBuckets = new Map<string, Bucket>();
  const otherBuckets = new Map<string, Bucket>();
  const noneBucket: Bucket = {
    key: `${focusCategoryId}::kind:NONE`,
    kind: 'NONE',
    fundingLabel: '—',
    journalIds: new Set(),
    cashbox_id: null,
    cashbox_name: null,
    cashbox_kind: null,
  };

  for (const m of allMovements) {
    const meta = journalCashboxMetaFromModel(model, m.journal_id);
    const kind =
      meta?.cashbox_kind ??
      resolveCashboxKind({
        code: meta?.cashbox_code,
        name: meta?.cashbox_name,
      });

    if (kind === 'CASH') {
      cashBucket.journalIds.add(m.journal_id);
      continue;
    }

    if (kind === 'BANK') {
      const bankKey =
        meta?.cashbox_id ||
        meta?.cashbox_code ||
        meta?.cashbox_name ||
        `bank-${m.journal_id}`;
      let bucket = bankBuckets.get(bankKey);
      if (!bucket) {
        bucket = {
          key: `${focusCategoryId}::cb:${bankKey}`,
          kind: 'BANK',
          fundingLabel: meta?.cashbox_name?.trim() || 'حساب مصرفي',
          journalIds: new Set(),
          cashbox_id: meta?.cashbox_id ?? null,
          cashbox_name: meta?.cashbox_name ?? null,
          cashbox_kind: 'BANK',
        };
        bankBuckets.set(bankKey, bucket);
      }
      bucket.journalIds.add(m.journal_id);
      continue;
    }

    if (kind === 'CARD' || kind === 'OTHER') {
      const otherKey =
        meta?.cashbox_id ||
        meta?.cashbox_code ||
        meta?.cashbox_name ||
        `other-${m.journal_id}`;
      let bucket = otherBuckets.get(otherKey);
      if (!bucket) {
        bucket = {
          key: `${focusCategoryId}::cb:${otherKey}`,
          kind: kind === 'CARD' ? 'CARD' : 'OTHER',
          fundingLabel: meta?.cashbox_name?.trim() || 'خزينة أخرى',
          journalIds: new Set(),
          cashbox_id: meta?.cashbox_id ?? null,
          cashbox_name: meta?.cashbox_name ?? null,
          cashbox_kind: kind,
        };
        otherBuckets.set(otherKey, bucket);
      }
      bucket.journalIds.add(m.journal_id);
      continue;
    }

    noneBucket.journalIds.add(m.journal_id);
  }

  const orderedBuckets: Bucket[] = [];
  if (cashBucket.journalIds.size > 0) orderedBuckets.push(cashBucket);
  orderedBuckets.push(
    ...[...bankBuckets.values()].sort((a, b) =>
      a.fundingLabel.localeCompare(b.fundingLabel, 'ar'),
    ),
  );
  orderedBuckets.push(
    ...[...otherBuckets.values()].sort((a, b) =>
      a.fundingLabel.localeCompare(b.fundingLabel, 'ar'),
    ),
  );
  if (noneBucket.journalIds.size > 0) orderedBuckets.push(noneBucket);

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
    const movements = allMovements
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
    const contraLines = buildContraLinesForJournals(
      model,
      focusLine,
      bucket.journalIds,
    ).filter((l) => {
      if (bucket.kind === 'CASH') {
        return !l.cashbox_kind || l.cashbox_kind === 'CASH' || !l.cashbox_id;
      }
      if (bucket.kind === 'BANK') {
        if (l.cashbox_id && bucket.cashbox_id) {
          return l.cashbox_id === bucket.cashbox_id;
        }
        if (l.cashbox_kind === 'BANK' && bucket.cashbox_name) {
          return l.cashbox_name === bucket.cashbox_name;
        }
        return !l.cashbox_id || l.cashbox_kind === bucket.cashbox_kind;
      }
      return true;
    });

    let displayContra = contraLines;
    if (bucket.kind === 'CASH') {
      const cashContras = contraLines.filter((l) => l.cashbox_kind === 'CASH');
      const otherContras = contraLines.filter((l) => l.cashbox_kind !== 'CASH');
      if (cashContras.length > 1) {
        const mergedCash = mergeCashFocusLines(cashContras);
        displayContra = [
          {
            ...mergedCash,
            cashbox_name: 'النقدي',
            cashbox_kind: 'CASH',
          },
          ...otherContras,
        ];
      } else if (cashContras.length === 1) {
        displayContra = [
          {
            ...cashContras[0],
            cashbox_name: cashContras[0].cashbox_name || 'النقدي',
          },
          ...otherContras,
        ];
      }
    }

    const contraLabel =
      bucket.kind === 'NONE'
        ? resolvePeriodJournalContraLabel(displayContra, {
            sectionKind: 'NONE',
          })
        : bucket.fundingLabel;

    sections.push({
      sectionKey: bucket.key,
      sectionKind: bucket.kind,
      title: categoryName,
      fundingLabel: contraLabel,
      subtitle: makeSubtitle(contraLabel),
      focusLine,
      contraLines: displayContra,
      ...sectionTotals(focusLine, displayContra),
    });
  }

  return sections;
}

export function buildPeriodJournalEntryModel(input: {
  period: ReportPeriod;
  entries: JournalEntryRow[];
  lines: RawLine[];
  statusFilter?: JournalStatus | 'ALL';
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
    ]);

    const vouchers = buildPeriodJournalVouchers(withLabels, meta.id);
    const totalDebit = withLabels.reduce((s, l) => s + l.debit, 0);
    const totalCredit = withLabels.reduce((s, l) => s + l.credit, 0);

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

  /** صفوف البند المختار (كل خزينة على حدة) أولاً، ثم بقية الأطراف */
  const focusFirst = [
    ...withLabels.filter((l) => l.category_id === categoryId),
    ...sortPeriodLines(withLabels.filter((l) => l.category_id !== categoryId)),
  ];

  const vouchers = buildPeriodJournalVouchers(focusFirst, categoryId);
  const totalDebit = focusFirst.reduce((s, l) => s + l.debit, 0);
  const totalCredit = focusFirst.reduce((s, l) => s + l.credit, 0);

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
      ? `مجموع بند «${categoryFilter.name_ar}» — النقدي منفصل عن المصارف (كل مصرف بورقة) · ${model.periodLabel}`
      : model.description,
  };
}

/** جلب بنود كل القيود ثم تجميعها كقيد فترة واحد مع التفاصيل */
export async function fetchPeriodJournalEntry(input: {
  period: ReportPeriod;
  entries: JournalEntryRow[];
  statusFilter?: JournalStatus | 'ALL';
}): Promise<PeriodJournalEntryModel> {
  if (input.entries.length === 0) {
    return buildPeriodJournalEntryModel({
      period: input.period,
      entries: [],
      lines: [],
      statusFilter: input.statusFilter,
    });
  }

  const supabase = createSupabaseBrowserClient();
  const ids = input.entries.map((e) => e.id);
  const allLines: RawLine[] = [];
  const chunkSize = 80;

  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    // الاسم والرمز والنوع (إن وُجدت هجرة 067) من الـ view؛ وإلا يُستنتج لاحقاً
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

  const cashboxIds = [
    ...new Set(
      allLines
        .map((l) => l.cashbox_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ];

  if (cashboxIds.length > 0) {
    const kindById = new Map<string, CashboxKind>();
    const boxChunk = 100;
    for (let i = 0; i < cashboxIds.length; i += boxChunk) {
      const slice = cashboxIds.slice(i, i + boxChunk);
      const { data: boxes, error: boxesError } = await supabase
        .from('cashboxes')
        .select('id, kind, name_ar, code')
        .in('id', slice);

      if (boxesError || !boxes?.length) {
        if (boxesError) {
          console.warn('[period-journal] cashbox kind lookup failed', boxesError);
        }
        break;
      }
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
  }

  return buildPeriodJournalEntryModel({
    period: input.period,
    entries: input.entries,
    lines: allLines,
    statusFilter: input.statusFilter,
  });
}
