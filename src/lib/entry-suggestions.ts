/**
 * What the new-transaction dialog can offer instead of making someone type: who and what they use most,
 * a party's usual account and last payment, and a draft of the description. Every result is a suggestion
 * the dialog shows as a chip; nothing here (or there) fills a field on its own.
 */
import { COUNTED_STATUSES, dayNumber } from '@/lib/duplicate-check';
import { arabicCount, formatDate, formatMoney, formatMonthKeyAr } from '@/lib/utils';

// ── who and what is used most ───────────────────────────────────────────────────────────────────

export type UsageRow = { contact_id: string | null; category_id: string | null; tx_date: string };
export type Usage = { contacts: Map<string, number>; categories: Map<string, number> };

/**
 * A use counts 1 today and half as much every `halfLifeDays` before, so three payments last month outrank
 * ten from two years ago. Dates in the future count as today; an unreadable date counts a little, not zero.
 */
export function buildUsage(rows: readonly UsageRow[], today: string, halfLifeDays = 60): Usage {
  const now = dayNumber(today);
  const contacts = new Map<string, number>();
  const categories = new Map<string, number>();
  for (const r of rows) {
    const then = dayNumber(r.tx_date);
    const weight = now === null || then === null ? 0.1 : Math.pow(0.5, Math.max(0, now - then) / halfLifeDays);
    if (r.contact_id) contacts.set(r.contact_id, (contacts.get(r.contact_id) ?? 0) + weight);
    if (r.category_id) categories.set(r.category_id, (categories.get(r.category_id) ?? 0) + weight);
  }
  return { contacts, categories };
}

/**
 * The few most used first (most used on top, at least `minScore` so a one-off from last year does not
 * qualify), then everything else in the order it came. Nothing is dropped or repeated.
 */
export function splitFrequent<T>(
  items: readonly T[],
  idOf: (item: T) => string,
  usage: ReadonlyMap<string, number>,
  { max = 5, minScore = 0.2 }: { max?: number; minScore?: number } = {},
): { frequent: T[]; rest: T[] } {
  const ranked = items
    .map((item, index) => ({ item, index, score: usage.get(idOf(item)) ?? 0 }))
    .filter((x) => x.score >= minScore)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, max);
  const chosen = new Set(ranked.map((x) => x.item));
  return { frequent: ranked.map((x) => x.item), rest: items.filter((item) => !chosen.has(item)) };
}

// ── a party's history ───────────────────────────────────────────────────────────────────────────

export type HistoryRow = {
  id: string;
  number: number | string;
  kind: string;
  status: string;
  amount: number | string;
  tx_date: string;
  created_at?: string | null;
  category_id: string | null;
};

function counted(r: HistoryRow, kind: string): boolean {
  return r.kind === kind && (COUNTED_STATUSES as readonly string[]).includes(r.status);
}

export type CategorySuggestion = { categoryId: string; count: number };

/**
 * The account this party is usually posted under, for this kind: the one with the most counted
 * transactions, the most recent winning a tie. Only accounts in `allowed` (active, of this kind) qualify.
 */
export function suggestCategoryFromHistory(
  rows: readonly HistoryRow[],
  kind: string,
  allowed?: ReadonlySet<string>,
): CategorySuggestion | null {
  const tally = new Map<string, { count: number; last: string }>();
  for (const r of rows) {
    if (!counted(r, kind) || !r.category_id) continue;
    if (allowed && !allowed.has(r.category_id)) continue;
    const t = tally.get(r.category_id) ?? { count: 0, last: '' };
    t.count += 1;
    if (r.tx_date > t.last) t.last = r.tx_date;
    tally.set(r.category_id, t);
  }
  let best: { id: string; count: number; last: string } | null = null;
  for (const [id, t] of tally) {
    if (!best || t.count > best.count || (t.count === best.count && t.last > best.last)) best = { id, ...t };
  }
  return best ? { categoryId: best.id, count: best.count } : null;
}

export type LastPayment = { id: string; number: number; amount: number; date: string };

/** The newest counted transaction of this kind: by its date, then when it was entered, then its number. */
export function lastPaymentFromHistory(rows: readonly HistoryRow[], kind: string): LastPayment | null {
  let best: HistoryRow | null = null;
  for (const r of rows) {
    if (!counted(r, kind)) continue;
    const amount = Number(r.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    if (
      !best ||
      r.tx_date > best.tx_date ||
      (r.tx_date === best.tx_date && ((r.created_at ?? '') > (best.created_at ?? '') || ((r.created_at ?? '') === (best.created_at ?? '') && Number(r.number) > Number(best.number))))
    ) {
      best = r;
    }
  }
  return best ? { id: best.id, number: Number(best.number), amount: Math.round(Number(best.amount) * 1000) / 1000, date: best.tx_date } : null;
}

const TIMES: [string, string, string, string] = ['مرة واحدة', 'مرتين', 'مرات', 'مرة'];

/** «استُخدم مرتين» / «استُخدم 8 مرات». */
export function usedTimesAr(count: number): string {
  return `استُخدم ${arabicCount(count, TIMES)}`;
}

/** «آخر دفعة 1,250 د.ل بتاريخ 03 أكتوبر 2026» (for money in: «آخر تحصيل»). */
export function lastPaymentLabelAr(kind: string, last: LastPayment): string {
  return `${kind === 'REVENUE' ? 'آخر تحصيل' : 'آخر دفعة'} ${formatMoney(last.amount, 'LYD')} بتاريخ ${formatDate(last.date)}`;
}

// ── the description ─────────────────────────────────────────────────────────────────────────────

/**
 * A line to start from: «كهرباء · مؤسسة النور · أكتوبر 2026». Needs an account or a party; the month is
 * the entry date's. Null when there is nothing to build it from.
 */
export function suggestDescription(input: { categoryName?: string | null; contactName?: string | null; date?: string | null }): string | null {
  const category = input.categoryName?.trim();
  const contact = input.contactName?.trim();
  if (!category && !contact) return null;
  const month = input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? formatMonthKeyAr(input.date.slice(0, 7)) : null;
  return [category, contact, month].filter(Boolean).join(' · ');
}
