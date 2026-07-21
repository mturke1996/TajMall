import type { ContactKind } from '@/lib/db/types';

/** إيرادات خدمات/مواقف/إعلانات يمكن ربطها بعميل بدون عقد إيجار. */
export const CUSTOMER_SERVICE_REVENUE_CODES = [
  'REV-PRK',
  'REV-SVC',
  'REV-ADV',
  'REV-KSK',
  'REV-EVT',
  'REV-LIC',
  'REV-PEN',
] as const;

/** مصروفات تشغيل شائعة يُقترح لها مورد. */
export const VENDOR_SERVICE_EXPENSE_CODES = [
  'EXP-MNT',
  'EXP-CLN',
  'EXP-SEC',
  'EXP-EQP',
  'EXP-MAT',
  'EXP-CON',
] as const;

/** مصروفات مرتبات — يُقترح لها موظف (كلا الرمزين للتوافق). */
export const EMPLOYEE_SALARY_CODES = ['EXP-SAL', 'EXP-SLR'] as const;

export type PartyContactFilter =
  | 'ALL'
  | 'TENANT'
  | 'EMPLOYEE'
  | 'CUSTOMER'
  | 'VENDOR';

export function isCustomerServiceRevenueCode(code: string | undefined | null): boolean {
  if (!code) return false;
  return (CUSTOMER_SERVICE_REVENUE_CODES as readonly string[]).includes(code);
}

export function isVendorServiceExpenseCode(code: string | undefined | null): boolean {
  if (!code) return false;
  return (VENDOR_SERVICE_EXPENSE_CODES as readonly string[]).includes(code);
}

export function isEmployeeSalaryCode(code: string | undefined | null): boolean {
  if (!code) return false;
  return (EMPLOYEE_SALARY_CODES as readonly string[]).includes(code);
}

export function isRentRevenueCode(code: string | undefined | null): boolean {
  return code === 'REV-RNT' || code === 'REV-SRV';
}

/**
 * يقترح فلتر الجهة المناسب حسب نوع المعاملة ورمز البند.
 * لا يفرض اختيار جهة — يوجّه الواجهة فقط.
 */
export function suggestedContactKindForTx(
  txKind: 'REVENUE' | 'EXPENSE',
  categoryCode?: string | null,
): PartyContactFilter {
  if (txKind === 'REVENUE') {
    if (isRentRevenueCode(categoryCode)) return 'TENANT';
    if (isCustomerServiceRevenueCode(categoryCode)) return 'CUSTOMER';
    return 'ALL';
  }
  if (isEmployeeSalaryCode(categoryCode)) return 'EMPLOYEE';
  if (isVendorServiceExpenseCode(categoryCode)) return 'VENDOR';
  return 'VENDOR';
}

export function contactKindLabelAr(kind: PartyContactFilter | ContactKind | string): string {
  switch (kind) {
    case 'VENDOR':
      return 'مورد';
    case 'CUSTOMER':
      return 'عميل';
    case 'TENANT':
      return 'مستأجر';
    case 'EMPLOYEE':
      return 'موظف';
    case 'ALL':
      return 'جهة';
    default:
      return 'جهة';
  }
}

export type PartyTxAggInput = {
  contactId: string;
  contactName: string;
  phone?: string | null;
  amount: number;
  categoryCode?: string | null;
  categoryNameAr?: string | null;
};

export type PartyAggRow = {
  contactId: string;
  contactName: string;
  phone: string | null;
  total: number;
  txCount: number;
  byCategory: { code: string; nameAr: string; total: number; count: number }[];
};

/** تجميع معاملات مرتبطة بجهات — للتقارير. */
export function aggregatePartyTotals(rows: PartyTxAggInput[]): PartyAggRow[] {
  const map = new Map<string, PartyAggRow>();

  for (const row of rows) {
    if (!row.contactId) continue;
    const amount = Number(row.amount);
    if (!Number.isFinite(amount) || amount === 0) continue;

    let agg = map.get(row.contactId);
    if (!agg) {
      agg = {
        contactId: row.contactId,
        contactName: row.contactName || '—',
        phone: row.phone ?? null,
        total: 0,
        txCount: 0,
        byCategory: [],
      };
      map.set(row.contactId, agg);
    }

    agg.total += amount;
    agg.txCount += 1;

    const code = row.categoryCode ?? '—';
    const nameAr = row.categoryNameAr ?? code;
    let cat = agg.byCategory.find((c) => c.code === code);
    if (!cat) {
      cat = { code, nameAr, total: 0, count: 0 };
      agg.byCategory.push(cat);
    }
    cat.total += amount;
    cat.count += 1;
  }

  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}
