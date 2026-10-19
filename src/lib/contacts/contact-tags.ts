/**
 * The machine tags kept inside `contacts.notes`, and the person-written text around them.
 *
 *   [role:landlord]   what the contact is to the mall (see contact-roles.ts)
 *   [since:2026-06]   the month the system starts following this contact's monthly obligation; every
 *                     month before it counts as settled before the system existed
 *
 * `contacts` has no column for either, so they travel in the notes. Screens never show them
 * (`visibleNotes`) and every save goes through `withRole` / `withSince` so editing a note can not drop them.
 *
 * Reading is forgiving (any case, any spacing, CRLF, Arabic-Indic digits, repeated tags); writing is exact:
 * the text first, then `[role:x]`, then `[since:YYYY-MM]`, each on its own line.
 */
import { extractContactBusinessRole, type ContactBusinessRole } from '@/lib/contacts/contact-roles';
import { getCountedContactTransactions } from '@/lib/contacts/contact-transactions';
import type { ContactRow } from '@/lib/db/types';
import { arabicCount } from '@/lib/utils';

// ---------------------------------------------------------------- syntax

/** Role tags in the order they win when a note carries more than one (same order contact-roles always used). */
const ROLE_PRIORITY: readonly ContactBusinessRole[] = [
  'LANDLORD',
  'SUPPLIER_ELECTRICITY',
  'SUPPLIER_WATER',
  'SUPPLIER_GOODS',
  'SERVICE_PROVIDER',
  'TENANT',
  'EMPLOYEE',
  'CUSTOMER',
  'OTHER',
];

// `[role:x]` with any spacing, or a bare `role:x` somewhere in the text (older notes were typed that way).
// New RegExp per call: a shared /g regex keeps lastIndex between calls.
const roleRx = () => /\[\s*role\s*:\s*([a-z_]+)\s*\]|role:([a-z_]+)/gi;
// any bracket that starts with `since:`, so a malformed one is hidden even though it can not be read
const sinceRx = () => /\[\s*since\s*:([^\]\n]*)\]/gi;

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;
const isMonthKey = (v: unknown): v is string => typeof v === 'string' && MONTH_KEY.test(v);

/** ٢٠٢٦ → 2026, so a month typed on an Arabic keyboard is still read. */
function westernDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/** "2026-07", "2026-7", "2026/07", "2026-07-15" → "2026-07"; anything else → null. */
export function toSinceMonth(value: string | null | undefined): string | null {
  const m = /^\s*(\d{4})\s*[-/]\s*(\d{1,2})(?:\s*[-/]\s*\d{1,2})?\s*$/.exec(westernDigits(String(value ?? '')));
  if (!m) return null;
  const month = Number(m[2]);
  return month >= 1 && month <= 12 ? `${m[1]}-${String(month).padStart(2, '0')}` : null;
}

export type ContactTags = {
  /** The role the tag names; null when the note carries none. `OTHER` only when it says so. */
  role: ContactBusinessRole | null;
  /** First month followed by the system, "YYYY-MM"; null when not set (or the tag is not a real month). */
  since: string | null;
};

/** The tags in a note. Several role tags: the one that wins by priority. Several since tags: the last valid one. */
export function readTags(notes: string | null | undefined): ContactTags {
  const text = String(notes ?? '');

  const found = new Set<string>();
  for (const m of text.matchAll(roleRx())) found.add((m[1] ?? m[2]).toUpperCase());
  const role = ROLE_PRIORITY.find((r) => found.has(r)) ?? null;

  let since: string | null = null;
  for (const m of text.matchAll(sinceRx())) since = toSinceMonth(m[1]) ?? since;

  return { role, since };
}

function stripTags(line: string): string {
  return line.replace(roleRx(), '').replace(sinceRx(), '');
}

/**
 * The note as a person wrote it: no tag of any kind. A line that held only tags disappears; a tag in the
 * middle of a sentence leaves single spaces. Line breaks come back as "\n". Empty string when nothing is left.
 */
export function visibleNotes(notes: string | null | undefined): string {
  const lines = String(notes ?? '').replace(/\r\n?/g, '\n').split('\n');
  const kept: string[] = [];
  for (const line of lines) {
    const bare = stripTags(line);
    if (bare === line) {
      kept.push(line);
      continue;
    }
    const tidy = bare.replace(/[ \t]{2,}/g, ' ').trim();
    if (tidy) kept.push(tidy);
  }
  return kept.join('\n').trim();
}

/** Text, then the role tag, then the since tag. A month that is not "YYYY-MM" throws: it would be lost silently. */
export function composeNotes(parts: { text?: string | null; role?: ContactBusinessRole | null; since?: string | null }): string {
  const lines: string[] = [];
  const text = (parts.text ?? '').trim();
  if (text) lines.push(text);
  if (parts.role) lines.push(`[role:${parts.role.toLowerCase()}]`);
  if (parts.since) {
    if (!isMonthKey(parts.since)) throw new RangeError(`since must be YYYY-MM, got "${parts.since}"`);
    lines.push(`[since:${parts.since}]`);
  }
  return lines.join('\n');
}

/**
 * The note with this role (null removes the role tag). The text and the since tag are kept.
 * Any earlier role tag, wherever it stood, is replaced.
 */
export function withRole(notes: string | null | undefined, role: ContactBusinessRole | null): string {
  return composeNotes({ text: visibleNotes(notes), role, since: readTags(notes).since });
}

/**
 * The note with this tracking-start month ("YYYY-MM"); null or "" removes it. The text and the role tag are
 * kept. A value that is not a month throws a RangeError instead of being dropped without a word.
 */
export function withSince(notes: string | null | undefined, month: string | null | undefined): string {
  const since = month == null || month === '' ? null : month;
  if (since !== null && !isMonthKey(since)) throw new RangeError(`month must be YYYY-MM, got "${since}"`);
  return composeNotes({ text: visibleNotes(notes), role: readTags(notes).role, since });
}

// ---------------------------------------------------------------- landlords

/**
 * A landlord is a contact tagged `[role:landlord]` (or one the older rules already read as a landlord), whether
 * the file sits under vendors or customers. The kind never decides it: the mall's landlords were filed under both.
 */
export function isLandlord(contact: Partial<Pick<ContactRow, 'kind' | 'notes' | 'job_title' | 'department' | 'monthly_rent'>> | null | undefined): boolean {
  if (!contact) return false;
  if (contact.kind !== 'VENDOR' && contact.kind !== 'CUSTOMER') return false;
  return extractContactBusinessRole(contact) === 'LANDLORD';
}

/** What the suggestion needs of a transaction; the full row fits. */
export type LandlordEvidenceTx = {
  kind?: string | null;
  status?: string | null;
  amount: string | number | null;
  tx_date: string;
  category?: { code?: string | null } | null;
};

export type LandlordSuggestion = {
  /** the screen may offer «اعتمادها مؤجراً» */
  suggest: boolean;
  /** why not, when `suggest` is false */
  reason: 'rent_without_revenue' | 'already_landlord' | 'has_revenue' | 'no_rent_payments' | 'not_vendor_or_customer';
  /** counted EXPENSE rows in EXP-RNT */
  rentPayments: number;
  rentTotal: number;
  /** counted REVENUE rows */
  revenueCount: number;
  firstPaidOn: string | null;
  lastPaidOn: string | null;
};

export const RENT_EXPENSE_CODE = 'EXP-RNT';
export const LANDLORD_SUGGESTION_ACTION = 'اعتمادها مؤجراً';

const asAmount = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Whether a contact looks like a landlord by what was paid to them: counted rent expenses (EXP-RNT) and no
 * revenue at all. Only reads; nothing is changed by it. Pass the contact to stay quiet for one that already is
 * a landlord or can not be one (a tenant or an employee).
 */
export function suggestLandlord(
  transactions: readonly LandlordEvidenceTx[],
  contact?: Partial<Pick<ContactRow, 'kind' | 'notes' | 'job_title' | 'department' | 'monthly_rent'>> | null,
): LandlordSuggestion {
  const counted = getCountedContactTransactions(transactions);
  const rent = counted.filter((t) => t.kind === 'EXPENSE' && String(t.category?.code ?? '').trim().toUpperCase() === RENT_EXPENSE_CODE);
  const revenueCount = counted.filter((t) => t.kind === 'REVENUE').length;
  const dates = rent.map((t) => String(t.tx_date).slice(0, 10)).filter(Boolean).sort();

  const base = {
    rentPayments: rent.length,
    rentTotal: Math.round(rent.reduce((s, t) => s + asAmount(t.amount), 0) * 1000) / 1000,
    revenueCount,
    firstPaidOn: dates[0] ?? null,
    lastPaidOn: dates[dates.length - 1] ?? null,
  };

  if (contact) {
    if (contact.kind !== 'VENDOR' && contact.kind !== 'CUSTOMER') return { ...base, suggest: false, reason: 'not_vendor_or_customer' };
    if (isLandlord(contact)) return { ...base, suggest: false, reason: 'already_landlord' };
  }
  if (rent.length === 0) return { ...base, suggest: false, reason: 'no_rent_payments' };
  if (revenueCount > 0) return { ...base, suggest: false, reason: 'has_revenue' };
  return { ...base, suggest: true, reason: 'rent_without_revenue' };
}

/** One line for the offer, e.g. «دُفع له إيجار في 4 دفعات، ولا يوجد إيراد منه.» Null when there is nothing to say. */
export function landlordSuggestionText(s: Pick<LandlordSuggestion, 'suggest' | 'rentPayments'>): string | null {
  if (!s.suggest) return null;
  const payments = arabicCount(s.rentPayments, ['دفعة واحدة', 'دفعتين', 'دفعات', 'دفعة']);
  return `دُفع له إيجار في ${payments}، ولا يوجد إيراد منه.`;
}
