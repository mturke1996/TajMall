import type { TenantChargeWithRelations } from '@/lib/db/types';
import type { TenantRentSummary } from '@/lib/db/queries';
import { formatMonthLabelAr } from '@/lib/rent-months';
import { getTenantCurrentMonthPresentation } from '@/lib/tenant-current-month';

export type RentPdfStatusTone = 'paid' | 'partial' | 'unpaid' | 'neutral';

/** تسمية حالة الإيجار في PDF — متناسقة مع واجهة الملف */
export function rentChargePdfStatusLabel(
  status: string,
  amount: number,
  totalPaid: number,
): string {
  const paid = Number(totalPaid) || 0;
  const due = Number(amount) || 0;
  if (due > 0 && paid >= due) return 'مدفوع بالكامل';
  if (status === 'PAID' && paid > 0) return 'مدفوع بالكامل';
  if (status === 'PARTIAL' || (paid > 0 && paid < due)) return 'جزء من الإيجار';
  if (status === 'OVERDUE') return 'متأخر';
  if (status === 'UNPAID' || paid <= 0) return 'غير مدفوع';
  return '—';
}

export function rentSummaryPdfStatusLabel(
  status: TenantRentSummary['current_month_status'],
): string {
  switch (status) {
    case 'paid_full':
      return 'مدفوع بالكامل';
    case 'paid_partial':
      return 'جزء من الإيجار';
    case 'unpaid':
      return 'غير مدفوع';
    case 'no_rent_set':
      return 'بلا إيجار';
    default:
      return '—';
  }
}

export function rentChargePdfStatusTone(
  status: string,
  amount: number,
  totalPaid: number,
): RentPdfStatusTone {
  const label = rentChargePdfStatusLabel(status, amount, totalPaid);
  if (label === 'مدفوع بالكامل') return 'paid';
  if (label === 'جزء من الإيجار') return 'partial';
  if (label === 'غير مدفوع' || label === 'متأخر') return 'unpaid';
  return 'neutral';
}

export type TenantRentMonthReceiptModel = {
  tenant_name: string;
  shop_number: string | null;
  unit_floor: string | null;
  phone: string | null;
  month_key: string;
  month_label: string;
  due_date: string;
  amount: number;
  total_paid: number;
  remaining: number;
  status_label: string;
  status_tone: RentPdfStatusTone;
  description: string;
  journal_lines: { number: number; entry_date: string; amount: number }[];
};

export function chargeToRentReceiptModel(
  charge: TenantChargeWithRelations,
  extras?: { shop_number?: string | null; unit_floor?: string | null },
): TenantRentMonthReceiptModel {
  const amount = Number(charge.amount) || 0;
  const total_paid = Number(charge.total_paid) || 0;
  const remaining = Math.max(0, amount - total_paid);
  const month_key = charge.due_date?.slice(0, 7) ?? '';
  const tenant = charge.contract?.tenant;
  const unit = charge.contract?.unit;

  const links = (charge.rent_journal_links ?? [])
    .filter((l) => l.journal?.number != null)
    .map((l) => ({
      number: Number(l.journal!.number),
      entry_date: l.journal!.entry_date,
      amount: Number(l.amount) || 0,
    }))
    .sort((a, b) => (a.entry_date < b.entry_date ? 1 : -1));

  if (links.length === 0 && charge.journal?.number != null) {
    links.push({
      number: Number(charge.journal.number),
      entry_date: charge.journal.entry_date,
      amount: total_paid,
    });
  }

  return {
    tenant_name: tenant?.name ?? 'مستأجر',
    shop_number: unit?.unit_number ?? extras?.shop_number ?? null,
    unit_floor: unit?.floor ?? extras?.unit_floor ?? null,
    phone: tenant?.phone ?? null,
    month_key,
    month_label: month_key ? formatMonthLabelAr(month_key) : charge.description,
    due_date: charge.due_date,
    amount,
    total_paid,
    remaining,
    status_label: rentChargePdfStatusLabel(charge.status, amount, total_paid),
    status_tone: rentChargePdfStatusTone(charge.status, amount, total_paid),
    description:
      charge.description ||
      (month_key ? `إيجار ${formatMonthLabelAr(month_key)}` : 'إيجار محل'),
    journal_lines: links,
  };
}

export type ContactDossierMonthRow = {
  month_key: string;
  month_label: string;
  amount: number;
  paid: number;
  remaining: number;
  status_label: string;
  status_tone: RentPdfStatusTone;
};

export function chargesToDossierMonthRows(
  charges: TenantChargeWithRelations[],
  year?: number,
): ContactDossierMonthRow[] {
  const y = year ?? new Date().getFullYear();
  return charges
    .filter((c) => c.type === 'RENT' && c.due_date?.startsWith(String(y)))
    .sort((a, b) => (a.due_date < b.due_date ? -1 : 1))
    .map((c) => {
      const amount = Number(c.amount) || 0;
      const paid = Number(c.total_paid) || 0;
      const month_key = c.due_date.slice(0, 7);
      return {
        month_key,
        month_label: formatMonthLabelAr(month_key),
        amount,
        paid,
        remaining: Math.max(0, amount - paid),
        status_label: rentChargePdfStatusLabel(c.status, amount, paid),
        status_tone: rentChargePdfStatusTone(c.status, amount, paid),
      };
    });
}

export function rentSummaryForDossierPdf(
  rent: TenantRentSummary,
  monthlyRentFallback: number,
) {
  const pres = getTenantCurrentMonthPresentation(rent, monthlyRentFallback);
  return {
    monthName: pres.monthName,
    headline: pres.headline,
    subtitle: pres.subtitle,
    statusLabel: rentSummaryPdfStatusLabel(rent.current_month_status),
    amount: pres.amount,
    paid: pres.paid,
    remaining: pres.remaining,
    percentPaid: pres.percentPaid,
    tone: pres.tone,
  };
}
