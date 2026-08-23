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
