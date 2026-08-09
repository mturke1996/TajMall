'use client';

import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export type PeriodRevenueCompare = {
  /** تحصيل نقدي لكل بنود الإيراد (transactions) */
  cashAllRevenue: number;
  /** تحصيل نقدي لبند إيجارات المحلات فقط */
  cashRent: number;
  /** اعتراف محاسبي دائن REV-RNT من القيود المرحّلة */
  accruedRent: number;
  /** اعتراف محاسبي لكل بنود الإيراد */
  accruedAllRevenue: number;
};

const PAGE = 1000;

/**
 * مقارنة تحصيل نقدي (صفحة الإيرادات) مع الاعتراف المحاسبي (قيد الفترة / البنود)
 * لنفس الفترة — لإزالة لبس «200 ألف vs رقم أصغر».
 */
export async function fetchPeriodRevenueCompare(
  startDate: string,
  endDate: string,
): Promise<PeriodRevenueCompare> {
  const supabase = createSupabaseBrowserClient();

  let cashAllRevenue = 0;
  let cashRent = 0;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('transactions')
      .select('amount, category:categories(code)')
      .eq('kind', 'REVENUE')
      .eq('status', 'POSTED')
      .gte('tx_date', startDate)
      .lte('tx_date', endDate)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = data ?? [];
    for (const row of rows) {
      const amt = Number(row.amount) || 0;
      cashAllRevenue += amt;
      const code = (row.category as { code?: string } | null)?.code;
      if (code === 'REV-RNT') cashRent += amt;
    }
    if (rows.length < PAGE) break;
    from += PAGE;
  }

  let accruedRent = 0;
  let accruedAllRevenue = 0;
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase.rpc('get_journal_lines_for_period', {
      p_start_date: startDate,
      p_end_date: endDate,
      p_status: 'POSTED',
      p_category_id: null,
      p_limit: 5000,
      p_offset: offset,
    });
    if (error) throw error;
    const rows = (data as Array<{
      category_code?: string;
      category_type?: string;
      credit?: number | string;
    }>) ?? [];
    for (const row of rows) {
      const credit = Number(row.credit) || 0;
      if (credit <= 0) continue;
      if (row.category_type === 'REVENUE') accruedAllRevenue += credit;
      if (row.category_code === 'REV-RNT') accruedRent += credit;
    }
    if (rows.length < 5000) break;
    offset += 5000;
  }

  return { cashAllRevenue, cashRent, accruedRent, accruedAllRevenue };
}
