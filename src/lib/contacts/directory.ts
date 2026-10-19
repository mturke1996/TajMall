/**
 * What the people lists need that a single contact's profile does not: which list a contact belongs to,
 * which role filters a list offers, the last twelve months of money for every contact from one read of the
 * counted transactions, the totals above a list, and the order of its rows.
 *
 * Money is counted by direction (REVENUE came in, EXPENSE went out), never by the contact's kind: the mall's
 * landlords were filed under customers, so a customer file can be one the mall pays. Only counted rows
 * (POSTED and RECONCILED) are read.
 *
 * Landlords live under customers whatever their kind is; the role tag (`[role:landlord]`) is what makes one
 * (contact-tags.ts `isLandlord`). Vendors are the other VENDOR files.
 */
import { CONTACT_ROLES, extractContactBusinessRole, visibleContactNotes, type ContactBusinessRole } from '@/lib/contacts/contact-roles';
import { isLandlord, suggestLandlord, type LandlordEvidenceTx, type LandlordSuggestion } from '@/lib/contacts/contact-tags';
import { isCountedTransaction } from '@/lib/contacts/contact-transactions';
import { matchesSearch, normalizeArabic } from '@/lib/arabic-search';
import type { ContactRow } from '@/lib/db/types';
import { last12MonthKeys, type Direction } from '@/lib/people/party-stats';
import type { PeopleSegment } from '@/lib/mall/routes';
import { formatMoney } from '@/lib/utils';

// ---------------------------------------------------------------- which list a contact is in

export type ContactSegment = 'TENANT' | 'EMPLOYEE' | 'VENDOR' | 'CUSTOMER' | 'OTHER';

type SegmentFields = Pick<ContactRow, 'kind'> & Partial<Pick<ContactRow, 'notes' | 'job_title' | 'department' | 'monthly_rent'>>;

/**
 * The list a contact is shown in. Tenants and employees follow their kind. A landlord goes under customers
 * whether its file is a vendor or a customer; every other VENDOR is a vendor. `OTHER` is listed only in the
 * all-people list.
 */
export function segmentOfContact(contact: SegmentFields): ContactSegment {
  switch (contact.kind) {
    case 'TENANT':
      return 'TENANT';
    case 'EMPLOYEE':
      return 'EMPLOYEE';
    case 'CUSTOMER':
      return 'CUSTOMER';
    case 'VENDOR':
      return isLandlord(contact) ? 'CUSTOMER' : 'VENDOR';
    default:
      return 'OTHER';
  }
}

export function inSegment(contact: SegmentFields, segment: PeopleSegment): boolean {
  return segment === 'all' || segmentOfContact(contact) === segment;
}

// ---------------------------------------------------------------- role filters

export type RoleFilter = ContactBusinessRole | 'ALL';

export type RoleChip = { id: RoleFilter; label: string };

const CHIP_LABEL: Partial<Record<ContactBusinessRole, string>> = {
  TENANT: 'مستأجرون',
  LANDLORD: 'مؤجرون',
  SUPPLIER_ELECTRICITY: 'كهرباء وطاقة',
  SUPPLIER_WATER: 'مياه وصرف',
  SUPPLIER_GOODS: 'بضائع ومواد',
  SERVICE_PROVIDER: 'خدمات ومقاولات',
  EMPLOYEE: 'موظفون',
  CUSTOMER: 'عملاء',
};

const chip = (id: ContactBusinessRole): RoleChip => ({ id, label: CHIP_LABEL[id] ?? CONTACT_ROLES[id].badge });
const ALL_CHIP: RoleChip = { id: 'ALL', label: 'الكل' };

/** The role filters a list offers. Tenants and employees have nothing to tell apart, so they offer none. */
export function roleChipsFor(segment: PeopleSegment): RoleChip[] {
  switch (segment) {
    case 'VENDOR':
      return [ALL_CHIP, chip('SUPPLIER_ELECTRICITY'), chip('SUPPLIER_WATER'), chip('SUPPLIER_GOODS'), chip('SERVICE_PROVIDER')];
    case 'CUSTOMER':
      return [ALL_CHIP, chip('LANDLORD'), chip('CUSTOMER')];
    case 'all':
      return [
        ALL_CHIP,
        chip('TENANT'),
        chip('LANDLORD'),
        chip('SUPPLIER_ELECTRICITY'),
        chip('SUPPLIER_WATER'),
        chip('SUPPLIER_GOODS'),
        chip('SERVICE_PROVIDER'),
        chip('EMPLOYEE'),
        chip('CUSTOMER'),
      ];
    default:
      return [];
  }
}

/**
 * A role read from the address bar (`?role=LANDLORD`), made safe for a list: unknown text, a role the list
 * does not offer, or nothing at all is `ALL`. This is what keeps an old filter from surviving a change of list.
 */
export function normalizeRoleFilter(segment: PeopleSegment, raw: string | null | undefined): RoleFilter {
  const wanted = String(raw ?? '').trim().toUpperCase();
  if (!wanted || wanted === 'ALL') return 'ALL';
  return roleChipsFor(segment).some((c) => c.id === wanted) ? (wanted as ContactBusinessRole) : 'ALL';
}

export function matchesRoleFilter(contact: SegmentFields, filter: RoleFilter): boolean {
  if (filter === 'ALL') return true;
  if (filter === 'LANDLORD') return isLandlord(contact);
  return extractContactBusinessRole(contact) === filter;
}

/** Active contacts per list, for the segment navigation. */
export function segmentCountsOf(contacts: readonly (SegmentFields & { is_active?: boolean })[]): Record<PeopleSegment, number> {
  const out: Record<PeopleSegment, number> = { all: 0, TENANT: 0, EMPLOYEE: 0, VENDOR: 0, CUSTOMER: 0 };
  for (const c of contacts) {
    if (c.is_active === false) continue;
    out.all += 1;
    const s = segmentOfContact(c);
    if (s !== 'OTHER') out[s] += 1;
  }
  return out;
}

/** How many contacts each role chip of a list would show (active ones, or all of them). */
export function roleCountsOf(
  contacts: readonly (SegmentFields & { is_active?: boolean })[],
  segment: PeopleSegment,
  includeInactive = false,
): Map<RoleFilter, number> {
  const pool = contacts.filter((c) => inSegment(c, segment) && (includeInactive || c.is_active !== false));
  const out = new Map<RoleFilter, number>();
  for (const { id } of roleChipsFor(segment)) out.set(id, pool.filter((c) => matchesRoleFilter(c, id)).length);
  return out;
}

// ---------------------------------------------------------------- twelve months of money

export type SideActivity = {
  total: number;
  count: number;
  /** the twelve months ending with this one, oldest first, zeros included */
  series: number[];
  /** the latest day with money on this side, and what that day added up to */
  last: { date: string; amount: number } | null;
};

export type ContactActivity = {
  in: SideActivity;
  out: SideActivity;
  count: number;
  /** the contact's counted rows in the window, as `suggestLandlord` wants them */
  evidence: LandlordEvidenceTx[];
};

/** What the read of transactions has to return per row. */
export type ActivityInput = {
  contact_id: string | null;
  kind: string | null;
  status: string | null;
  amount: string | number | null;
  tx_date: string;
  category?: { code?: string | null } | null;
};

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const amountOf = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const emptySide = (): SideActivity => ({ total: 0, count: 0, series: Array.from({ length: 12 }, () => 0), last: null });
const emptyActivity = (): ContactActivity => ({ in: emptySide(), out: emptySide(), count: 0, evidence: [] });

/** Shared by every contact with no money in the window. Never changed. */
export const NO_ACTIVITY: ContactActivity = Object.freeze({
  in: Object.freeze(emptySide()) as SideActivity,
  out: Object.freeze(emptySide()) as SideActivity,
  count: 0,
  evidence: [],
});

/** First day of the window the twelve-month figures cover, "YYYY-MM-DD". */
export function activityWindowStart(asOf: string): string {
  return `${last12MonthKeys(asOf)[0]}-01`;
}

/**
 * Every contact's last twelve months from one list of rows: what came in, what went out, the monthly series
 * and the latest day. Rows with no contact, an uncounted status, another kind (transfers, adjustments), an
 * amount that is not positive, a bad date, or a month outside the window are left out.
 */
export function buildDirectoryActivity(rows: readonly ActivityInput[], options: { asOf?: string } = {}): Map<string, ContactActivity> {
  const months = last12MonthKeys(options.asOf);
  const monthIndex = new Map(months.map((m, i) => [m, i]));
  const out = new Map<string, ContactActivity>();

  for (const row of rows) {
    const id = row.contact_id;
    if (!id || !isCountedTransaction(row)) continue;
    const direction: Direction | null = row.kind === 'REVENUE' ? 'in' : row.kind === 'EXPENSE' ? 'out' : null;
    const date = String(row.tx_date ?? '').slice(0, 10);
    const amount = amountOf(row.amount);
    if (!direction || !DAY.test(date) || amount <= 0) continue;
    const at = monthIndex.get(date.slice(0, 7));
    if (at === undefined) continue;

    const act = out.get(id) ?? emptyActivity();
    out.set(id, act);
    const side = act[direction];
    side.total += amount;
    side.count += 1;
    side.series[at] += amount;
    if (!side.last || date > side.last.date) side.last = { date, amount };
    else if (date === side.last.date) side.last.amount += amount;
    act.count += 1;
    act.evidence.push({ kind: row.kind, status: row.status, amount, tx_date: date, category: row.category ?? null });
  }

  for (const act of out.values()) {
    for (const side of [act.in, act.out]) {
      side.total = round3(side.total);
      side.series = side.series.map(round3);
      if (side.last) side.last.amount = round3(side.last.amount);
    }
  }
  return out;
}

/**
 * The side a row leads with: money paid for landlords, vendors and staff, money received for customers and
 * tenants. The data has the last word when the role's side is empty and the other is not, so a customer file
 * that only ever received money (a landlord or a utility filed under customers) leads with out.
 */
export function listDirection(contact: SegmentFields, activity?: ContactActivity | null): Direction {
  const role = extractContactBusinessRole(contact);
  const byRole: Direction = role === 'TENANT' || role === 'CUSTOMER' || role === 'OTHER' ? 'in' : 'out';
  if (!activity) return byRole;
  const preferred: Direction = role === 'OTHER' ? (activity.out.total > activity.in.total ? 'out' : 'in') : byRole;
  const other: Direction = preferred === 'in' ? 'out' : 'in';
  return activity[preferred].count === 0 && activity[other].count > 0 ? other : preferred;
}

// ---------------------------------------------------------------- rows

export type DirectoryRow = {
  contact: ContactRow;
  role: ContactBusinessRole;
  landlord: boolean;
  direction: Direction;
  /** the side the row leads with, and the opposite one */
  main: SideActivity;
  other: SideActivity;
  hasActivity: boolean;
  /** the latest day of money on either side */
  lastDate: string | null;
  /** set when the file looks like a landlord by what was paid to it but is not tagged as one */
  landlordHint: LandlordSuggestion | null;
};

export function buildDirectoryRows(contacts: readonly ContactRow[], activity: ReadonlyMap<string, ContactActivity> | null | undefined): DirectoryRow[] {
  return contacts.map((contact) => {
    const act = activity?.get(contact.id) ?? NO_ACTIVITY;
    const direction = listDirection(contact, activity ? act : null);
    const other: Direction = direction === 'in' ? 'out' : 'in';
    const landlord = isLandlord(contact);
    const lastDates = [act.in.last?.date, act.out.last?.date].filter((d): d is string => !!d).sort();

    let landlordHint: LandlordSuggestion | null = null;
    if (!landlord && act.out.count > 0 && (contact.kind === 'VENDOR' || contact.kind === 'CUSTOMER')) {
      const s = suggestLandlord(act.evidence, contact);
      if (s.suggest) landlordHint = s;
    }

    return {
      contact,
      role: landlord ? 'LANDLORD' : extractContactBusinessRole(contact),
      landlord,
      direction,
      main: act[direction],
      other: act[other],
      hasActivity: act.count > 0,
      lastDate: lastDates[lastDates.length - 1] ?? null,
      landlordHint,
    };
  });
}

// ---------------------------------------------------------------- search, filter, sort

/** What a typed search looks at: names, phones, codes, place, job and the role in words (so «مؤجر» finds landlords). */
export function directorySearchFields(row: Pick<DirectoryRow, 'contact' | 'role'>): unknown[] {
  const c = row.contact;
  const role = CONTACT_ROLES[row.role];
  return [c.name, c.name_en, c.phone, c.phone2, c.shop_number, c.job_title, c.department, c.code, c.email, c.address, role.badge, role.label];
}

export type DirectoryFilter = {
  role?: RoleFilter;
  query?: string;
  showInactive?: boolean;
};

export function filterDirectoryRows(rows: readonly DirectoryRow[], filter: DirectoryFilter = {}): DirectoryRow[] {
  const { role = 'ALL', query = '', showInactive = false } = filter;
  return rows.filter((r) => {
    if (!showInactive && !r.contact.is_active) return false;
    if (!matchesRoleFilter(r.contact, role)) return false;
    return matchesSearch(query, directorySearchFields(r));
  });
}

export type SortKey = 'name' | 'recent' | 'total';
export type SortDir = 'asc' | 'desc';
export type SortState = { key: SortKey; dir: SortDir };

export const DEFAULT_SORT: SortState = { key: 'name', dir: 'asc' };
export const SORT_LABEL: Record<SortKey, string> = { name: 'الاسم', recent: 'آخر حركة', total: 'إجمالي 12 شهراً' };
/** the direction a key starts in when it is chosen: names A to Z, dates and amounts biggest first */
export const defaultDirOf = (key: SortKey): SortDir => (key === 'name' ? 'asc' : 'desc');

const nameOf = (r: DirectoryRow) => normalizeArabic(r.contact.name);

export function sortDirectoryRows(rows: readonly DirectoryRow[], sort: SortState = DEFAULT_SORT): DirectoryRow[] {
  const sign = sort.dir === 'asc' ? 1 : -1;
  const byName = (a: DirectoryRow, b: DirectoryRow) => nameOf(a).localeCompare(nameOf(b), 'ar') || a.contact.id.localeCompare(b.contact.id);
  return [...rows].sort((a, b) => {
    if (sort.key === 'name') return sign * byName(a, b);
    if (sort.key === 'recent') {
      // a file with no movement goes last whichever way the list runs
      if (a.lastDate === null || b.lastDate === null) {
        if (a.lastDate === b.lastDate) return byName(a, b);
        return a.lastDate === null ? 1 : -1;
      }
      return sign * a.lastDate.localeCompare(b.lastDate) || byName(a, b);
    }
    return sign * (a.main.total - b.main.total) || byName(a, b);
  });
}

// ---------------------------------------------------------------- totals above a list

export type LastMoney = { date: string; amount: number; contactId: string; name: string };

export type DirectorySummary = {
  /** active files */
  count: number;
  inactive: number;
  /** active landlords among them */
  landlords: number;
  /** active files with money in the window */
  withActivity: number;
  /** money of every file in the list, inactive ones included: it moved either way */
  in: { total: number; count: number };
  out: { total: number; count: number };
  /** the part of `out` that went to landlords */
  landlordsOut: { total: number; count: number };
  lastIn: LastMoney | null;
  lastOut: LastMoney | null;
};

/** The rows are the whole list (inactive files too): counts are of active files, money is of all. */
export function summarizeDirectory(rows: readonly DirectoryRow[]): DirectorySummary {
  const sum: DirectorySummary = {
    count: 0,
    inactive: 0,
    landlords: 0,
    withActivity: 0,
    in: { total: 0, count: 0 },
    out: { total: 0, count: 0 },
    landlordsOut: { total: 0, count: 0 },
    lastIn: null,
    lastOut: null,
  };
  const pick = (current: LastMoney | null, side: SideActivity, row: DirectoryRow): LastMoney | null => {
    if (!side.last) return current;
    if (current && (current.date > side.last.date || (current.date === side.last.date && current.amount >= side.last.amount))) return current;
    return { date: side.last.date, amount: side.last.amount, contactId: row.contact.id, name: row.contact.name };
  };
  for (const r of rows) {
    if (r.contact.is_active) {
      sum.count += 1;
      if (r.landlord) sum.landlords += 1;
      if (r.hasActivity) sum.withActivity += 1;
    } else {
      sum.inactive += 1;
    }
    const inSide = r.direction === 'in' ? r.main : r.other;
    const outSide = r.direction === 'out' ? r.main : r.other;
    sum.in.total += inSide.total;
    sum.in.count += inSide.count;
    sum.out.total += outSide.total;
    sum.out.count += outSide.count;
    if (r.landlord) {
      sum.landlordsOut.total += outSide.total;
      sum.landlordsOut.count += outSide.count;
    }
    sum.lastIn = pick(sum.lastIn, inSide, r);
    sum.lastOut = pick(sum.lastOut, outSide, r);
  }
  sum.in.total = round3(sum.in.total);
  sum.out.total = round3(sum.out.total);
  sum.landlordsOut.total = round3(sum.landlordsOut.total);
  return sum;
}

// ---------------------------------------------------------------- a row's second line

/** What identifies a contact beyond the name: shop, site, meter, job, or where it is. (Phone and mail have their own column.) */
export function contactDetail(contact: ContactRow): string | null {
  const role = extractContactBusinessRole(contact);
  const rent = Number(contact.monthly_rent) > 0 ? `إيجار ${formatMoney(Number(contact.monthly_rent), 'LYD')} شهرياً` : null;
  const join = (parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(' · ') || null;
  if (role === 'LANDLORD') return join([contact.shop_number && `موقع ${contact.shop_number}`, rent]);
  if (role === 'TENANT') return join([`محل ${contact.shop_number || '—'}`, contact.floor && `الطابق ${contact.floor}`, rent]);
  if (role === 'SUPPLIER_ELECTRICITY' || role === 'SUPPLIER_WATER') return join([contact.shop_number && `عداد ${contact.shop_number}`, contact.department]);
  if (contact.job_title || contact.department) return join([contact.job_title, contact.department]);
  const firstNote = visibleContactNotes(contact.notes).split('\n')[0];
  return join([contact.address, firstNote]);
}
