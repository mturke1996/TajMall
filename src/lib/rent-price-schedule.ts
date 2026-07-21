/** جدول أسعار إيجار متغيرة حسب نطاق الشهور */

export type RentPriceBand = {
  id?: string;
  from_month: string;
  to_month: string;
  amount: number;
  notes?: string | null;
};

export type RentPriceBandDraft = {
  /** مفتاح محلي للنموذج */
  key: string;
  fromYear: number;
  fromMonth: number;
  toYear: number;
  toMonth: number;
  amount: string;
  notes: string;
};

export function monthKeyFromParts(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function bandToMonthKey(band: Pick<RentPriceBandDraft, 'fromYear' | 'fromMonth'>): string {
  return monthKeyFromParts(band.fromYear, band.fromMonth);
}

export function bandToToMonthKey(band: Pick<RentPriceBandDraft, 'toYear' | 'toMonth'>): string {
  return monthKeyFromParts(band.toYear, band.toMonth);
}

export function draftFromBand(band: RentPriceBand, key?: string): RentPriceBandDraft {
  const [fy, fm] = band.from_month.split('-').map(Number);
  const [ty, tm] = band.to_month.split('-').map(Number);
  return {
    key: key ?? band.id ?? `${band.from_month}-${band.to_month}`,
    fromYear: fy,
    fromMonth: fm,
    toYear: ty,
    toMonth: tm,
    amount: String(band.amount),
    notes: band.notes ?? '',
  };
}

export function emptyBandDraft(year: number, key: string): RentPriceBandDraft {
  return {
    key,
    fromYear: year,
    fromMonth: 1,
    toYear: year,
    toMonth: 3,
    amount: '',
    notes: '',
  };
}

export function resolveAmountFromBands(
  bands: RentPriceBand[],
  monthKey: string,
  fallback = 0,
): number {
  const match = [...bands]
    .filter((b) => monthKey >= b.from_month && monthKey <= b.to_month)
    .sort((a, b) => b.from_month.localeCompare(a.from_month))[0];
  if (match && Number(match.amount) > 0) return Number(match.amount);
  return fallback;
}

export function validateBandDrafts(
  drafts: RentPriceBandDraft[],
): { ok: true; bands: RentPriceBand[] } | { ok: false; error: string } {
  const parsed: RentPriceBand[] = [];

  for (const d of drafts) {
    const amount = Number(d.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return { ok: false, error: 'كل نطاق يجب أن يكون له مبلغ أكبر من صفر' };
    }
    const from = monthKeyFromParts(d.fromYear, d.fromMonth);
    const to = monthKeyFromParts(d.toYear, d.toMonth);
    if (from > to) {
      return { ok: false, error: `النطاق ${from} → ${to} غير صالح (البداية بعد النهاية)` };
    }
    parsed.push({
      from_month: from,
      to_month: to,
      amount,
      notes: d.notes.trim() || null,
    });
  }

  parsed.sort((a, b) => a.from_month.localeCompare(b.from_month));
  for (let i = 1; i < parsed.length; i++) {
    if (parsed[i].from_month <= parsed[i - 1].to_month) {
      return {
        ok: false,
        error: `تداخل بين ${parsed[i - 1].from_month}–${parsed[i - 1].to_month} و ${parsed[i].from_month}–${parsed[i].to_month}`,
      };
    }
  }

  return { ok: true, bands: parsed };
}

export function formatBandLabelAr(band: RentPriceBand): string {
  if (band.from_month === band.to_month) return band.from_month;
  return `${band.from_month} → ${band.to_month}`;
}
