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
    'lines' | 'sourceEntryCount' | 'periodLabel' | 'balanced' | 'categoryFilter'
  > | null,
): PeriodJournalExportNames {
  const periodLabel = model?.periodLabel ?? formatReportPeriodLabelAr(period);
  const categorySlug = model?.categoryFilter?.code;
  const fileName = buildPdfFileName(
    'period-journal',
    formatReportPeriodSlugEn(period),
    categorySlug ?? (model?.categoryFilter ? undefined : 'comprehensive'),
  );

  const categoryNote = model?.categoryFilter
    ? ` · بند ${model.categoryFilter.name_ar}`
    : ' · شامل كل البنود';
  const shareTitle = `قيد محاسبي — ${periodLabel}${categoryNote} · ${BRAND.name}`;
  const lineCount = model?.lines.length ?? 0;
  const entryCount = model?.sourceEntryCount ?? 0;
  const balanceNote =
    model?.balanced === false ? ' (يتطلب مراجعة — غير متوازن)' : '';
  const scopeLine = model?.categoryFilter
    ? `كشف بند ${model.categoryFilter.name_ar} (${model.categoryFilter.code}): قيود مزدوجة كاملة مع الطرف المقابل (الخزينة وغيرها).`
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

export function periodLineRowKey(
  categoryId: string,
  cashboxId?: string | null,
): string {
  return cashboxId ? `${categoryId}::cb:${cashboxId}` : categoryId;
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
    } else {
      map.set(rowKey, {
        category_id: categoryId,
        category_code: line.category_code ?? '',
        category_name: line.category_name ?? 'بند غير معروف',
        category_type: line.category_type,
        cashbox_id: cashboxId,
        cashbox_name: line.cashbox_name_ar,
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
  return line.cashbox_name?.trim() || '—';
}

/**
 * أطراف مقابلة لصف تركيز (بند أو خزينة محددة) ضمن نفس القيود المصدر.
 */
export function buildContraLinesForFocus(
  model: PeriodJournalEntryModel,
  focusLine: PeriodJournalLine,
): PeriodJournalLine[] {
  const journalIds = new Set(focusLine.movements.map((m) => m.journal_id));
  const related: PeriodJournalLine[] = [];
  for (const line of model.lines) {
    if (line.rowKey === focusLine.rowKey) continue;
    const movements = line.movements.filter((m) => journalIds.has(m.journal_id));
    if (movements.length === 0) continue;
    const debit = movements.reduce((s, m) => s + m.debit, 0);
    const credit = movements.reduce((s, m) => s + m.credit, 0);
    related.push({
      ...line,
      debit,
      credit,
      net: debit - credit,
      movements,
    });
  }
  return sortPeriodLines(related);
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
 * تصفية القيد لبند محاسبي واحد — أو إرجاع الكل.
 *
 * عند اختيار بند:
 * - نُظهر كل أطراف القيود التي لمسها البند (مصروف + خزينة + …)
 * - المبالغ تبقى حقيقية على كل بند (لا نسخ دائن الخزينة داخل بند المصروف)
 * - vouchers = كل قيد يومية كامل حتى يظهر مدين = دائن بوضوح
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
      title: `قيد الفترة الشامل — ${model.periodLabel}`,
      description: `كل البنود خلال ${model.periodLabel} — مجاميع ثم مجموع كل بند`,
      lines,
      vouchers: [],
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
      ? `قيود مزدوجة كاملة لـ «${categoryFilter.name_ar}»: كل قيد يعرض المدين والدائن (مثل خصم الخزينة) · ${model.periodLabel}`
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
    // الاسم والرمز متوفران في الـ view؛ النوع يُستنتج من الرمز/الاسم
    // أو من جدول cashboxes إن سمح RLS
    const { data, error } = await supabase
      .from('journal_lines_with_categories')
      .select(
        'journal_id, category_id, debit, credit, description, category_code, category_name, category_type, cashbox_id, cashbox_name_ar, cashbox_code, contact_name, sort_order',
      )
      .in('journal_id', chunk)
      .order('sort_order', { ascending: true });

    if (error) throw error;
    allLines.push(
      ...((data ?? []).map((row) => {
        const base = row as Omit<RawLine, 'cashbox_kind'>;
        return {
          ...base,
          cashbox_kind: resolveCashboxKind({
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
