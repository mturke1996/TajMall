/**
 * Arabic-aware text matching for list search.
 *
 * Users type the same word several ways (أحمد / احمد, مدرسة / مدرسه, علي / على,
 * ٢٠٢٦ / 2026). Normalising both sides makes the search find what they meant.
 */

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const EASTERN_ARABIC = '۰۱۲۳۴۵۶۷۸۹';

export function normalizeArabic(input: unknown): string {
  if (input === null || input === undefined) return '';
  let s = String(input).toLowerCase();
  s = s.replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC.indexOf(d)));
  s = s.replace(/[۰-۹]/g, (d) => String(EASTERN_ARABIC.indexOf(d)));
  s = s
    .replace(/[ً-ٰٟـ]/g, '') // tashkeel + tatweel
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[٬,]/g, '')
    .replace(/٫/g, '.')
    .replace(/\s+/g, ' ')
    .trim();
  return s;
}

/**
 * True when every word of `query` appears in at least one of `fields`.
 * Word-wise matching lets «محل 12 ايجار» find a row whose shop number and
 * description are in different columns.
 */
export function matchesSearch(query: string, fields: unknown[]): boolean {
  const q = normalizeArabic(query);
  if (!q) return true;
  const haystack = fields.map(normalizeArabic).join(' \u0000 ');
  return q.split(' ').every((word) => haystack.includes(word));
}

// ── ranked search (pickers) ──────────────────────────────────────────────────────────────────────
//
// `matchesSearch` answers yes/no for a list filter. A picker also has to put the best answer first:
// typing «نور» should show «النور للتجارة» before «مؤسسة الحنور», and «0912» should find a phone written
// «+218 91-2345678» or «091 2345678». Fields are normalised once (`prepareSearchFields`) so a keystroke
// only compares strings.

export type SearchField =
  | string
  | number
  | null
  | undefined
  | {
      text: unknown;
      /** 0–1; a secondary field (phone, code) ranks below the name. Default 1. */
      weight?: number;
      /** phone-like: compared by its digits, so spaces, dashes and the country code do not matter */
      digits?: boolean;
    };

export type PreparedField = { text: string; digits: string; weight: number; phone: boolean };
export type PreparedQuery = { words: string[]; digitWords: string[]; whole: string };

export function digitsOnly(input: unknown): string {
  return normalizeArabic(input).replace(/\D/g, '');
}

export function prepareSearchFields(fields: SearchField[]): PreparedField[] {
  const out: PreparedField[] = [];
  for (const f of fields) {
    if (f === null || f === undefined) continue;
    const spec = typeof f === 'object' ? f : { text: f };
    const text = normalizeArabic(spec.text);
    if (!text) continue;
    out.push({
      text,
      digits: text.replace(/\D/g, ''),
      weight: spec.weight ?? 1,
      phone: Boolean(spec.digits),
    });
  }
  return out;
}

export function prepareSearchQuery(query: string): PreparedQuery | null {
  const whole = normalizeArabic(query);
  if (!whole) return null;
  const words = whole.split(' ');
  // a word made only of digits and phone punctuation is also compared by its digits
  const digitWords = words.map((w) => (/^[\d+\-()]+$/.test(w) ? w.replace(/\D/g, '') : ''));
  return { words, digitWords, whole };
}

function scoreWord(word: string, text: string): number {
  if (text === word) return 1;
  if (text.startsWith(word)) return 0.9;
  if (text.includes(` ${word}`)) return 0.75;
  // «نور» is the start of «النور»: the article is not part of the name people type
  if (text.startsWith(`ال${word}`) || text.includes(` ال${word}`)) return 0.7;
  if (text.includes(word)) return 0.5;
  return 0;
}

function scoreDigits(digitWord: string, digits: string): number {
  if (!digitWord || !digits) return 0;
  if (digits === digitWord) return 1;
  if (digits.startsWith(digitWord)) return 0.85;
  // «0912345678» typed for a number stored as «218912345678»: the trunk 0 is not part of the number
  const bare = digitWord.length >= 4 ? digitWord.replace(/^0+/, '') : digitWord;
  if (bare.length >= 3 && digits.includes(bare)) return 0.6;
  return 0;
}

/**
 * 0 when some word of the query matches no field; otherwise 0–1, the mean of each word's best field
 * (exact > prefix > start of a later word > anywhere), scaled by the field's weight.
 * A query that is empty matches everything with 1.
 */
export function scorePrepared(query: PreparedQuery | null, fields: PreparedField[]): number {
  if (!query) return 1;
  let total = 0;
  for (let i = 0; i < query.words.length; i++) {
    const word = query.words[i];
    const digitWord = query.digitWords[i];
    let best = 0;
    for (const f of fields) {
      let s = scoreWord(word, f.text);
      if (digitWord && (f.phone || s === 0)) s = Math.max(s, scoreDigits(digitWord, f.digits));
      s *= f.weight;
      if (s > best) best = s;
    }
    if (best === 0) return 0;
    total += best;
  }
  let score = total / query.words.length;
  // the whole phrase opening the main field («شركة ال» → «شركة النور») edges out a scattered match
  if (query.words.length > 1 && fields[0] && fields[0].text.startsWith(query.whole)) score = Math.min(1, score + 0.05);
  return score;
}

export function scoreSearch(query: string, fields: SearchField[]): number {
  return scorePrepared(prepareSearchQuery(query), prepareSearchFields(fields));
}

/**
 * Items that match, best first; equal scores fall back to `usageOf` (more used first), then to the order
 * given. An empty query returns the items as they came.
 */
export function rankBySearch<T>(
  items: readonly T[],
  query: string,
  fieldsOf: (item: T) => PreparedField[],
  usageOf?: (item: T) => number,
): T[] {
  const q = prepareSearchQuery(query);
  if (!q) return [...items];
  const scored: { item: T; score: number; usage: number; index: number }[] = [];
  items.forEach((item, index) => {
    const score = scorePrepared(q, fieldsOf(item));
    if (score > 0) scored.push({ item, score, usage: usageOf?.(item) ?? 0, index });
  });
  scored.sort((a, b) => b.score - a.score || b.usage - a.usage || a.index - b.index);
  return scored.map((s) => s.item);
}
