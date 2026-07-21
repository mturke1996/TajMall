import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type { JournalEntryRow, JournalStatus } from '@/lib/db/journal-queries';
import { BRAND } from '@/lib/brand';
import {
  formatReportPeriodLabelAr,
  formatReportPeriodSlugEn,
  reportPeriodDateRange,
  type ReportPeriod,
} from '@/lib/report-period';
import { buildPdfFileName } from '@/lib/report-pdf-export';

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
    categorySlug,
  );

  const categoryNote = model?.categoryFilter
    ? ` · بند ${model.categoryFilter.name_ar}`
    : '';
  const shareTitle = `قيد محاسبي — ${periodLabel}${categoryNote} · ${BRAND.name}`;
  const lineCount = model?.lines.length ?? 0;
  const entryCount = model?.sourceEntryCount ?? 0;
  const balanceNote =
    model?.categoryFilter
      ? ''
      : model?.balanced === false
        ? ' (يتطلب مراجعة — غير متوازن)'
        : '';
  const scopeLine = model?.categoryFilter
    ? `بند محاسبي واحد: ${model.categoryFilter.name_ar} (${model.categoryFilter.code}).`
    : lineCount > 0
      ? `يتضمن ${lineCount} بنداً محاسبياً بإجمالي مدين/دائن، مبنياً على ${entryCount} قيد مصدر.`
      : 'لا توجد حركة محاسبية في هذه الفترة.';

  const shareText = [
    `قيد محاسبي ملخّص للفترة: ${periodLabel}${balanceNote}.`,
    scopeLine,
    `${BRAND.fullName} — ${BRAND.tagline}`,
  ].join('\n');

  const documentTitle = model?.categoryFilter
    ? `${BRAND.name} — قيد محاسبي — ${model.categoryFilter.name_ar} — ${periodLabel}`
    : `${BRAND.name} — قيد محاسبي — ${periodLabel}`;

  return { fileName, shareTitle, shareText, documentTitle };
}

export type PeriodJournalLine = {
  category_id: string;
  category_code: string;
  category_name: string;
  category_type: string | null;
  /** إجمالي المدين للفترة على هذا البند */
  debit: number;
  /** إجمالي الدائن للفترة على هذا البند */
  credit: number;
  /** صافي الحركة (مدين − دائن) */
  net: number;
};

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
};

type RawLine = {
  journal_id: string;
  category_id: string;
  debit: string | number;
  credit: string | number;
  category_code: string | null;
  category_name: string | null;
  category_type: string | null;
};

/**
 * يجمع بنود القيود إلى «قيد محاسبي واحد» للفترة:
 * كل بند محاسبي يظهر مرة واحدة بإجمالي مدينه ودائنه.
 */
export function aggregatePeriodJournalLines(
  lines: RawLine[],
  journalIds: Set<string>,
): PeriodJournalLine[] {
  const map = new Map<string, PeriodJournalLine>();

  for (const line of lines) {
    if (!journalIds.has(line.journal_id)) continue;
    const id = line.category_id || '_unknown';
    const debit = Number(line.debit) || 0;
    const credit = Number(line.credit) || 0;
    if (debit === 0 && credit === 0) continue;

    const existing = map.get(id);
    if (existing) {
      existing.debit += debit;
      existing.credit += credit;
      existing.net = existing.debit - existing.credit;
    } else {
      map.set(id, {
        category_id: id,
        category_code: line.category_code ?? '',
        category_name: line.category_name ?? 'بند غير معروف',
        category_type: line.category_type,
        debit,
        credit,
        net: debit - credit,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    const typeOrder: Record<string, number> = {
      ASSET: 1,
      LIABILITY: 2,
      EQUITY: 3,
      REVENUE: 4,
      EXPENSE: 5,
    };
    const oA = typeOrder[a.category_type ?? ''] ?? 99;
    const oB = typeOrder[b.category_type ?? ''] ?? 99;
    if (oA !== oB) return oA - oB;
    const codeA = a.category_code || 'zzzz';
    const codeB = b.category_code || 'zzzz';
    return codeA.localeCompare(codeB, 'ar');
  });
}

export function buildPeriodJournalEntryModel(input: {
  period: ReportPeriod;
  entries: JournalEntryRow[];
  lines: RawLine[];
  statusFilter?: JournalStatus | 'ALL';
}): PeriodJournalEntryModel {
  const { startDate, endDate } = reportPeriodDateRange(input.period);
  const periodLabel = formatReportPeriodLabelAr(input.period);
  const journalIds = new Set(input.entries.map((e) => e.id));
  const aggregated = aggregatePeriodJournalLines(input.lines, journalIds);

  const totalDebit = aggregated.reduce((s, l) => s + l.debit, 0);
  const totalCredit = aggregated.reduce((s, l) => s + l.credit, 0);

  return {
    periodLabel,
    startDate,
    endDate,
    title: `قيد محاسبي — ${periodLabel}`,
    description: `ملخص حركة الحسابات للفترة ${periodLabel} (إجمالي كل بند)`,
    statusFilter: input.statusFilter ?? 'POSTED',
    categoryFilter: null,
    sourceEntryCount: input.entries.length,
    sourceLineCount: input.lines.filter((l) => journalIds.has(l.journal_id)).length,
    lines: aggregated,
    totalDebit,
    totalCredit,
    balanced: Math.abs(totalDebit - totalCredit) <= 0.005,
  };
}

/** إجمالي حركة البند (أكبر جانب مدين/دائن — للعرض لا للتوازن) */
export function periodJournalGrossMovement(debit: number, credit: number): number {
  return Math.max(debit, credit);
}

type CategoryFilterMeta = {
  id: string;
  code: string;
  name_ar: string;
  type?: string | null;
};

/** تصفية القيد لبند محاسبي واحد — أو إرجاع الكل */
export function applyPeriodJournalCategoryFilter(
  model: PeriodJournalEntryModel,
  categoryId: string | null | undefined,
  categoryMeta?: CategoryFilterMeta | null,
): PeriodJournalEntryModel {
  if (!categoryId || categoryId === 'all') {
    return { ...model, categoryFilter: null };
  }

  const existing = model.lines.find((l) => l.category_id === categoryId);
  const lines: PeriodJournalLine[] = existing ? [existing] : [];

  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);

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

  return {
    ...model,
    categoryFilter,
    lines,
    totalDebit,
    totalCredit,
    /** التوازن يُقاس على القيد الكامل للفترة — ليس على بند واحد */
    balanced: model.balanced,
    title: categoryFilter
      ? `قيد الفترة — ${categoryFilter.name_ar}`
      : model.title,
    description: categoryFilter
      ? `إجمالي حركة البند ${categoryFilter.name_ar} (${categoryFilter.code}) — ${model.periodLabel}`
      : model.description,
  };
}

/** جلب بنود كل القيود ثم تجميعها كقيد فترة واحد */
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
    const { data, error } = await supabase
      .from('journal_lines_with_categories')
      .select(
        'journal_id, category_id, debit, credit, category_code, category_name, category_type',
      )
      .in('journal_id', chunk);

    if (error) throw error;
    allLines.push(...((data as RawLine[]) ?? []));
  }

  return buildPeriodJournalEntryModel({
    period: input.period,
    entries: input.entries,
    lines: allLines,
    statusFilter: input.statusFilter,
  });
}
