/**
 * Calendar-day arithmetic on "YYYY-MM-DD" strings. Both days are read as UTC midnights, so the answer
 * is an exact whole number of days whatever the device's time zone or daylight saving.
 */
const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})/;

function utcDay(iso: string): number | null {
  const m = ISO_DAY.exec(iso);
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(t) ? null : t;
}

/** Whole days from `from` to `to` (negative when `to` is earlier); null when either is not a date. */
export function daysBetween(from: string, to: string): number | null {
  const a = utcDay(from);
  const b = utcDay(to);
  if (a == null || b == null) return null;
  return Math.round((b - a) / 86_400_000);
}

/** `iso` moved by a number of calendar days, as "YYYY-MM-DD". */
export function addDaysISO(iso: string, days: number): string {
  const t = utcDay(iso);
  if (t == null) return iso;
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10);
}

/** `iso` moved by whole months, clamped to the end of a shorter month (31 Jan + 1 month = 28/29 Feb). */
export function addMonthsISO(iso: string, months: number): string {
  const m = ISO_DAY.exec(iso);
  if (!m) return iso;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1 + months;
  const day = Number(m[3]);
  const lastDay = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, mo, Math.min(day, lastDay))).toISOString().slice(0, 10);
}
