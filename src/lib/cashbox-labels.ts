import type { CashboxKind } from '@/lib/db/types';

export const CASHBOX_KIND_LABEL_AR: Record<CashboxKind, string> = {
  CASH: 'خزينة نقدية',
  BANK: 'حساب مصرفي',
  CARD: 'بطاقة / POS',
  OTHER: 'أخرى',
};

export function formatCashboxKindAr(
  kind: string | null | undefined,
): string | null {
  if (!kind) return null;
  return CASHBOX_KIND_LABEL_AR[kind as CashboxKind] ?? kind;
}

/**
 * استنتاج النوع من رمز الخزينة عندما لا يتوفر عمود kind
 * (مثل CASH → نقدية، BNK-* → مصرفي).
 */
export function inferCashboxKindFromCode(
  code: string | null | undefined,
): CashboxKind | null {
  if (!code?.trim()) return null;
  const c = code.trim().toUpperCase();
  if (c === 'CASH' || c.startsWith('CASH') || c.startsWith('CA-')) return 'CASH';
  if (
    c.startsWith('BNK') ||
    c.startsWith('BANK') ||
    c.startsWith('BA-') ||
    c.includes('BANK')
  ) {
    return 'BANK';
  }
  if (c.startsWith('CARD') || c.startsWith('POS') || c.includes('POS')) {
    return 'CARD';
  }
  if (c.startsWith('OTH') || c.startsWith('OTHER')) return 'OTHER';
  return null;
}

/** استنتاج تقريبي من اسم الخزينة إن لم يتوفر kind ولا code */
export function inferCashboxKindFromName(
  name: string | null | undefined,
): CashboxKind | null {
  if (!name?.trim()) return null;
  const n = name.trim();
  if (/مصرف|بنك|bank/i.test(n)) return 'BANK';
  if (/بطاقة|pos|فيزا|ماستر/i.test(n)) return 'CARD';
  if (/نقد|صندوق|خزين/i.test(n)) return 'CASH';
  return null;
}

export function resolveCashboxKind(input: {
  kind?: string | null;
  code?: string | null;
  name?: string | null;
}): CashboxKind | null {
  if (input.kind && input.kind in CASHBOX_KIND_LABEL_AR) {
    return input.kind as CashboxKind;
  }
  return (
    inferCashboxKindFromCode(input.code) ??
    inferCashboxKindFromName(input.name)
  );
}

/** مثال: الخزينة النقدية (خزينة نقدية) */
export function formatCashboxDisplayAr(
  name: string | null | undefined,
  kind: string | null | undefined,
  code?: string | null,
): string | null {
  const resolved = resolveCashboxKind({ kind, code, name });
  const kindLabel = formatCashboxKindAr(resolved);
  if (name && kindLabel) return `${name} (${kindLabel})`;
  if (name) return name;
  if (kindLabel) return kindLabel;
  return null;
}

/** مثال: خزينة: الصندوق الرئيسي (خزينة نقدية) */
export function formatCashboxRefAr(
  name: string | null | undefined,
  kind: string | null | undefined,
  code?: string | null,
): string | null {
  const display = formatCashboxDisplayAr(name, kind, code);
  return display ? `خزينة: ${display}` : null;
}
