/**
 * Finds the contacts a new or edited one may already be: the same phone number in any spelling, the same name
 * in any spelling (أحمد / احمد, عبد الله / عبدالله, a different word order), or a name that contains the other.
 * It only suggests; the form warns and never blocks.
 */
import { normalizeArabic } from '@/lib/arabic-search';
import { phoneKey } from '@/lib/contacts/phone';
import type { ContactRow } from '@/lib/db/types';

export type MatchReason = 'phone' | 'same_name' | 'similar_name';

export type MatchableContact = Pick<ContactRow, 'id' | 'name' | 'phone' | 'phone2' | 'kind' | 'is_active'> &
  Partial<Pick<ContactRow, 'code' | 'notes' | 'job_title' | 'department' | 'monthly_rent'>>;

export type ContactMatch<C extends MatchableContact = MatchableContact> = {
  contact: C;
  reasons: MatchReason[];
  /** higher is a closer match */
  score: number;
};

export type PreparedContact<C extends MatchableContact = MatchableContact> = {
  contact: C;
  /** the name without spaces, normalised: «عبد الله» and «عبدالله» are one */
  flat: string;
  /** the words, without the article «ال», each once */
  words: string[];
  phones: Set<string>;
};

/** Words of a name, normalised, without the leading «ال» (so «النور» matches «نور»), each once. */
export function nameWords(name: unknown): string[] {
  const seen = new Set<string>();
  for (const raw of normalizeArabic(name).split(' ')) {
    const word = raw.length > 3 && raw.startsWith('ال') ? raw.slice(2) : raw;
    if (word) seen.add(word);
  }
  return [...seen];
}

const flatName = (name: unknown) => normalizeArabic(name).replace(/\s+/g, '');

/** Normalise a list once; matching then costs a few string comparisons per contact per keystroke. */
export function prepareContacts<C extends MatchableContact>(contacts: readonly C[]): PreparedContact<C>[] {
  return contacts.map((contact) => {
    const phones = new Set<string>();
    for (const p of [contact.phone, contact.phone2]) {
      const key = phoneKey(p);
      if (key) phones.add(key);
    }
    return { contact, flat: flatName(contact.name), words: nameWords(contact.name), phones };
  });
}

/** True when the two strings differ by at most one inserted, deleted or changed letter. */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

function nameReason(probeWords: string[], probeFlat: string, other: PreparedContact): MatchReason | null {
  if (probeWords.length === 0 || other.words.length === 0) return null;
  // «عبد الله» and «عبدالله»; «محمد علي» and «علي محمد»
  if (probeFlat === other.flat) return 'same_name';
  const a = [...probeWords].sort().join(' ');
  const b = [...other.words].sort().join(' ');
  if (a === b) return 'same_name';

  // one name holds all the words of the other («محمد الطاهر» in «محمد الطاهر بن علي»): at least two words, or a
  // lone word would call every «محمد» a copy of every other
  const [small, large] = probeWords.length <= other.words.length ? [probeWords, other.words] : [other.words, probeWords];
  if (small.length >= 2 && small.every((w) => large.includes(w))) return 'similar_name';

  // a slip of one letter in a name long enough that one letter is not a different name
  if (probeFlat.length >= 6 && other.flat.length >= 6 && withinOneEdit(probeFlat, other.flat)) return 'similar_name';
  return null;
}

const WEIGHT: Record<MatchReason, number> = { phone: 3, same_name: 2, similar_name: 1 };

/**
 * The contacts that look like the one being typed, closest first. Pass `prepareContacts(list)` (memoised) and
 * what is typed so far. A name of less than three letters, or a phone number that is not complete yet, finds
 * nothing: half a word would warn about everything. `excludeId` keeps a contact from matching itself.
 */
export function findContactMatches<C extends MatchableContact>(
  prepared: readonly PreparedContact<C>[],
  probe: { name?: string | null; phones?: ReadonlyArray<string | null | undefined> },
  options: { excludeId?: string | null; limit?: number } = {},
): ContactMatch<C>[] {
  const words = nameWords(probe.name);
  const flat = flatName(probe.name);
  const nameUsable = flat.length >= 3;
  const phoneKeys = new Set<string>();
  for (const p of probe.phones ?? []) {
    const key = phoneKey(p);
    if (key) phoneKeys.add(key);
  }
  if (!nameUsable && phoneKeys.size === 0) return [];

  const found: ContactMatch<C>[] = [];
  for (const other of prepared) {
    if (options.excludeId && other.contact.id === options.excludeId) continue;
    const reasons: MatchReason[] = [];
    for (const key of phoneKeys) {
      if (other.phones.has(key)) {
        reasons.push('phone');
        break;
      }
    }
    if (nameUsable) {
      const reason = nameReason(words, flat, other);
      if (reason) reasons.push(reason);
    }
    if (reasons.length === 0) continue;
    found.push({ contact: other.contact, reasons, score: reasons.reduce((s, r) => s + WEIGHT[r], 0) });
  }
  found.sort((x, y) => y.score - x.score || Number(y.contact.is_active) - Number(x.contact.is_active) || x.contact.name.localeCompare(y.contact.name, 'ar'));
  return found.slice(0, options.limit ?? 4);
}
