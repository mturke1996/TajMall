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
    'lines' | 'sourceEntryCount' | 'periodLabel' | 'balanced'
  > | null,
): PeriodJournalExportNames {
  const periodLabel = model?.periodLabel ?? formatReportPeriodLabelAr(period);
  const fileName = buildPdfFileName('period-journal', formatReportPeriodSlugEn(period));

  const shareTitle = `قيد محاسبي — ${periodLabel} · ${BRAND.name}`;
  const lineCount = model?.lines.length ?? 0;
  const entryCount = model?.sourceEntryCount ?? 0;
  const balanceNote = model?.balanced === false ? ' (يتطلب مراجعة — غير متوازن)' : '';

  const shareText = [
    `قيد محاسبي ملخّص للفترة: ${periodLabel}${balanceNote}.`,
    lineCount > 0
      ? `يتضمن ${lineCount} بنداً محاسبياً بإجمالي مدين/دائن، مبنياً على ${entryCount} قيد مصدر.`
      : 'لا توجد حركة محاسبية في هذه الفترة.',
    `${BRAND.fullName} — ${BRAND.tagline}`,
  ].join('\n');

  const documentTitle = `${BRAND.name} — قيد محاسبي — ${periodLabel}`;

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
    sourceEntryCount: input.entries.length,
    sourceLineCount: input.lines.filter((l) => journalIds.has(l.journal_id)).length,
    lines: aggregated,
    totalDebit,
    totalCredit,
    balanced: Math.abs(totalDebit - totalCredit) <= 0.005,
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
