/** The day's cashbox sheet as a short message the owner can read at a glance on WhatsApp. */
import { dayLabel, type DailyStatement } from '@/lib/daily-cashbox';
import { arabicCount, formatMoney } from '@/lib/utils';

const m = (n: number) => formatMoney(n, 'LYD');

export function buildDailyStatementMessage(s: DailyStatement): string {
  const lines = [`كشف الخزائن — تاج مول`, `ليوم ${dayLabel(s.date)}`, ''];
  for (const b of s.boxes) {
    lines.push(`${b.name}`);
    lines.push(`  الافتتاحي ${m(b.opening)}`);
    if (b.receipts > 0) lines.push(`  قبض ${m(b.receipts)}`);
    if (b.payments > 0) lines.push(`  صرف ${m(b.payments)}`);
    if (b.transfersIn > 0) lines.push(`  محوّل إليها ${m(b.transfersIn)}`);
    if (b.transfersOut > 0) lines.push(`  محوّل منها ${m(b.transfersOut)}`);
    lines.push(`  الختامي ${m(b.closing)}`);
  }
  lines.push('');
  lines.push(`المجموع: الافتتاحي ${m(s.totals.opening)} · قبض ${m(s.totals.receipts)} · صرف ${m(s.totals.payments)} · الختامي ${m(s.totals.closing)}`);
  lines.push(s.movements === 0 ? 'لا حركة في هذا اليوم.' : `الحركات: ${arabicCount(s.movements, ['حركة واحدة', 'حركتان', 'حركات', 'حركة'])}`);
  if (!s.allReconcile) lines.push('تنبيه: أرقام هذا الكشف لا تطابق دفتر الخزينة، راجعه قبل الاعتماد.');
  return lines.join('\n');
}

/** wa.me without a number: WhatsApp asks who to send it to. */
export const buildShareLink = (message: string) => `https://wa.me/?text=${encodeURIComponent(message)}`;
