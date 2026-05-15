/** مفتاح تخزين محلي لمسودة إذن الصرف (يجب أن يبقى ثابتاً لتجنّب فقدان البيانات عند التحديثات). */
export const VOUCHER_DRAFT_STORAGE_KEY = 'fluxen:voucher-draft:v1';

export type VoucherDraftSnapshot = {
  number: string;
  voucherDate: string;
  payee: string;
  bank: string;
  account: string;
  method: string;
  notes: string;
  lines: { description: string; amount: string }[];
};

export function loadVoucherDraft(): VoucherDraftSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(VOUCHER_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<VoucherDraftSnapshot>;
    if (!d || typeof d !== 'object') return null;
    return {
      number: typeof d.number === 'string' ? d.number : '',
      voucherDate: typeof d.voucherDate === 'string' ? d.voucherDate : '',
      payee: typeof d.payee === 'string' ? d.payee : '',
      bank: typeof d.bank === 'string' ? d.bank : '',
      account: typeof d.account === 'string' ? d.account : '',
      method: typeof d.method === 'string' ? d.method : 'نقدي',
      notes: typeof d.notes === 'string' ? d.notes : '',
      lines:
        Array.isArray(d.lines) && d.lines.length > 0
          ? d.lines.map((l) => ({
              description: typeof l?.description === 'string' ? l.description : '',
              amount: typeof l?.amount === 'string' ? l.amount : '',
            }))
          : [{ description: '', amount: '' }],
    };
  } catch {
    return null;
  }
}

export function saveVoucherDraft(data: VoucherDraftSnapshot): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(VOUCHER_DRAFT_STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearVoucherDraft(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(VOUCHER_DRAFT_STORAGE_KEY);
}
