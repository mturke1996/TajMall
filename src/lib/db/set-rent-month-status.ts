import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type { PostgrestError } from '@supabase/supabase-js';

export type SetRentMonthStatusInput = {
  tenantId: string;
  months: string[];
  paid: boolean;
  journalEntryId?: string | null;
  /** مبلغ الجزء؛ null = إكمال المتبقي (شهر كامل) */
  amount?: number | null;
};

function isMissingRpcSignature(error: PostgrestError): boolean {
  const msg = (error.message ?? '').toLowerCase();
  return (
    error.code === 'PGRST202' ||
    error.code === 'PGRST204' ||
    error.code === '42883' ||
    msg.includes('could not find the function') ||
    msg.includes('schema cache') ||
    (msg.includes('function') && msg.includes('does not exist'))
  );
}

function isUnitLeaseOverlapError(message: string): boolean {
  return message.includes('مؤجرة بعقد نشط');
}

/**
 * ربط شهر إيجار بقيد عبر RPC فقط.
 * لا يوجد fallback عميل يعلّم PAID بلا tenant_rent_journal_links —
 * ذلك كان يكسر العكس وملخصات التحصيل.
 */
export async function setTenantRentMonthStatus(
  input: SetRentMonthStatusInput,
): Promise<unknown> {
  const supabase = createSupabaseBrowserClient();

  if (input.paid && input.journalEntryId) {
    const { data: je, error: jeErr } = await supabase
      .from('journal_entries')
      .select('id')
      .eq('id', input.journalEntryId)
      .maybeSingle();
    if (jeErr) throw jeErr;
    if (!je) throw new Error('القيد غير موجود');
  }

  const fullArgs = {
    p_tenant_id: input.tenantId,
    p_months: input.months,
    p_paid: input.paid,
    p_journal_entry_id: input.paid ? input.journalEntryId ?? null : null,
    p_amount:
      input.paid && input.amount != null && input.amount > 0
        ? input.amount
        : null,
  };

  const { data, error } = await supabase.rpc(
    'set_tenant_rent_month_status',
    fullArgs,
  );

  if (!error) return data;

  if (isUnitLeaseOverlapError(error.message ?? '')) {
    throw new Error(
      'رقم المحل مربوط بعقد نشط لمستأجر آخر. شغّل هجرة 031 على قاعدة البيانات ثم أعد المحاولة.',
    );
  }

  if (isMissingRpcSignature(error)) {
    throw new Error(
      'دالة تحصيل الإيجار غير متاحة على القاعدة. طبّق ترحيلات Supabase (set_tenant_rent_month_status) ثم أعد المحاولة.',
    );
  }

  throw error;
}
