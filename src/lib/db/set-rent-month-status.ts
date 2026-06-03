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

function shouldFallbackToClient(error: PostgrestError): boolean {
  if (isMissingRpcSignature(error)) return true;
  const msg = error.message ?? '';
  if (isUnitLeaseOverlapError(msg)) return false;
  if (msg.includes('stack depth')) return false;
  return (
    msg.includes('لا يوجد عقد') ||
    msg.includes('ensure_tenant') ||
    msg.includes('Could not find the function')
  );
}

async function resolveUnitIdForRentCalendar(
  supabase: ReturnType<typeof createSupabaseBrowserClient>,
  tenantId: string,
  shopNumber: string | null | undefined,
  floor: string | null | undefined,
): Promise<string> {
  const dedicatedNumber = `تقويم-${tenantId.replace(/-/g, '').slice(0, 12)}`;
  const year = new Date().getFullYear();
  const startDate = `${year}-01-01`;
  const endDate = `${year + 10}-12-31`;

  const { data: dedicatedExisting } = await supabase
    .from('mall_units')
    .select('id')
    .eq('unit_number', dedicatedNumber)
    .maybeSingle();
  if (dedicatedExisting?.id) return dedicatedExisting.id;

  let candidateUnitId: string | null = null;
  if (shopNumber?.trim()) {
    const { data: shopUnit } = await supabase
      .from('mall_units')
      .select('id')
      .eq('unit_number', shopNumber.trim())
      .maybeSingle();
    candidateUnitId = shopUnit?.id ?? null;
  }

  if (candidateUnitId) {
    const { data: busyContracts } = await supabase
      .from('lease_contracts')
      .select('id, tenant_id')
      .eq('unit_id', candidateUnitId)
      .eq('status', 'ACTIVE')
      .lte('start_date', endDate)
      .gte('end_date', startDate);

    const blockedByOtherTenant = (busyContracts ?? []).some(
      (c) => c.tenant_id && c.tenant_id !== tenantId,
    );
    if (!blockedByOtherTenant) return candidateUnitId;
  }

  const { data: newUnit, error: unitErr } = await supabase
    .from('mall_units')
    .insert({
      unit_number: dedicatedNumber,
      floor: floor?.trim() || '—',
      area_sqm: 0,
      status: 'OCCUPIED',
      notes: `وحدة تقويم إيجار${shopNumber?.trim() ? ` — ${shopNumber.trim()}` : ''}`,
    })
    .select('id')
    .single();
  if (unitErr) throw unitErr;
  return newUnit.id;
}

async function ensureContractId(supabase: ReturnType<typeof createSupabaseBrowserClient>, tenantId: string) {
  const { data: rpcId, error: rpcErr } = await supabase.rpc('ensure_tenant_lease_contract', {
    p_tenant_id: tenantId,
  });
  if (!rpcErr && rpcId) return String(rpcId);

  const { data: existing } = await supabase
    .from('lease_contracts')
    .select('id')
    .eq('tenant_id', tenantId)
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data: contact, error: contactErr } = await supabase
    .from('contacts')
    .select('monthly_rent, shop_number, floor')
    .eq('id', tenantId)
    .single();
  if (contactErr) throw contactErr;

  const monthlyRent = Math.max(Number(contact.monthly_rent) || 0, 1);
  const unitId = await resolveUnitIdForRentCalendar(
    supabase,
    tenantId,
    contact.shop_number,
    contact.floor,
  );

  const year = new Date().getFullYear();
  const { data: contract, error: contractErr } = await supabase
    .from('lease_contracts')
    .insert({
      tenant_id: tenantId,
      unit_id: unitId,
      start_date: `${year}-01-01`,
      end_date: `${year + 10}-12-31`,
      monthly_rent: monthlyRent,
      services_amount: 0,
      deposit_amount: 0,
      status: 'ACTIVE',
    })
    .select('id')
    .single();
  if (contractErr) {
    if (isUnitLeaseOverlapError(contractErr.message ?? '')) {
      throw new Error(
        'رقم المحل مربوط بعقد نشط لمستأجر آخر. طبّق هجرة 031 على Supabase أو أنشئ عقداً من شاشة العقود.',
      );
    }
    throw contractErr;
  }

  await supabase
    .from('contacts')
    .update({
      monthly_rent: monthlyRent,
      shop_number: contact.shop_number,
      floor: contact.floor,
    })
    .eq('id', tenantId);

  return contract.id;
}

async function upsertRentChargeClient(
  tenantId: string,
  month: string,
  paid: boolean,
  journalEntryId: string | null,
  journalMeta?: { number: number; description: string | null },
) {
  const supabase = createSupabaseBrowserClient();
  const due = `${month}-01`;
  const contractId = await ensureContractId(supabase, tenantId);

  const { data: contact } = await supabase
    .from('contacts')
    .select('monthly_rent')
    .eq('id', tenantId)
    .single();
  const rentAmount = Math.max(Number(contact?.monthly_rent) || 0, 1);

  const { data: existing } = await supabase
    .from('tenant_charges')
    .select('id, amount')
    .eq('contract_id', contractId)
    .eq('type', 'RENT')
    .eq('due_date', due)
    .maybeSingle();

  let chargeId = existing?.id;
  if (!chargeId) {
    const { data: created, error: insErr } = await supabase
      .from('tenant_charges')
      .insert({
        contract_id: contractId,
        amount: rentAmount,
        due_date: due,
        type: 'RENT',
        description: `إيجار شهر ${month}`,
        status: 'UNPAID',
        total_paid: 0,
      })
      .select('id, amount')
      .single();
    if (insErr) throw insErr;
    chargeId = created.id;
  }

  const amount = Number(existing?.amount) || rentAmount;

  if (paid) {
    const desc =
      journalMeta != null
        ? `إيجار شهر ${month} · قيد #${journalMeta.number}${
            journalMeta.description?.trim()
              ? ` — ${journalMeta.description.trim()}`
              : ''
          }`
        : `إيجار شهر ${month}`;

    const { error: updErr } = await supabase
      .from('tenant_charges')
      .update({
        status: 'PAID',
        total_paid: amount,
        journal_entry_id: journalEntryId,
        description: desc,
        updated_at: new Date().toISOString(),
      })
      .eq('id', chargeId);
    if (updErr) throw updErr;
  } else {
    const { error: updErr } = await supabase
      .from('tenant_charges')
      .update({
        status: 'UNPAID',
        total_paid: 0,
        journal_entry_id: null,
        description: `إيجار شهر ${month}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', chargeId);
    if (updErr) throw updErr;
  }
}

/** ربط شهر إيجار بقيد — يُنشئ عقداً تلقائياً إن لزم */
export async function setTenantRentMonthStatus(
  input: SetRentMonthStatusInput,
): Promise<unknown> {
  const supabase = createSupabaseBrowserClient();

  let journalMeta: { number: number; description: string | null } | undefined;
  if (input.paid && input.journalEntryId) {
    const { data: je, error: jeErr } = await supabase
      .from('journal_entries')
      .select('number, description')
      .eq('id', input.journalEntryId)
      .maybeSingle();
    if (jeErr) throw jeErr;
    if (!je) throw new Error('القيد غير موجود');
    journalMeta = {
      number: Number(je.number),
      description: je.description,
    };
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

  if (shouldFallbackToClient(error)) {
    try {
      for (const month of input.months) {
        await upsertRentChargeClient(
          input.tenantId,
          month,
          input.paid,
          input.paid ? input.journalEntryId ?? null : null,
          input.paid ? journalMeta : undefined,
        );
      }
      return { ok: true, fallback: 'client' };
    } catch (clientErr) {
      const clientMsg =
        clientErr instanceof Error ? clientErr.message : 'فشل الحفظ المحلي';
      throw new Error(
        `${clientMsg}${error.message ? ` (${error.message})` : ''}`,
      );
    }
  }

  throw error;
}
