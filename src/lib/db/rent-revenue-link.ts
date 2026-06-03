import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { setTenantRentMonthStatus } from '@/lib/db/set-rent-month-status';
import { areConsecutiveMonths } from '@/lib/rent-months';

/** قيد اليومية الناتج عن معاملة إيراد مرحّلة */
export async function getJournalIdForTransaction(
  transactionId: string,
): Promise<string | null> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('journal_entries')
    .select('id')
    .eq('source_type', 'TRANSACTION')
    .eq('source_id', transactionId)
    .in('status', ['POSTED', 'DRAFT'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

/** بعد تسجيل الإيراد: ربط الشهور بالقيد في تقويم المستأجر */
export async function linkRentMonthsToRevenueJournal(input: {
  tenantId: string;
  months: string[];
  journalEntryId: string;
  amount?: number | null;
}) {
  if (input.months.length === 0) {
    throw new Error('حدّد شهر إيجار واحداً على الأقل');
  }
  if (!areConsecutiveMonths(input.months)) {
    throw new Error('اختر أشهراً متتالية فقط');
  }
  return setTenantRentMonthStatus({
    tenantId: input.tenantId,
    months: input.months,
    paid: true,
    journalEntryId: input.journalEntryId,
    amount: input.amount ?? null,
  });
}
