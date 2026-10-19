/**
 * The letters shown in a party's avatar tile. Arabic business names start with words that say nothing about
 * who it is («شركة», «مؤسسة», «الحاج») and with the article «ال», so the letters come from the first two
 * words that do. One word gives one letter: two letters of one Arabic word would join into a fragment.
 */

const GENERIC_WORDS = new Set([
  'شركة', 'الشركة', 'مؤسسة', 'المؤسسة', 'محل', 'محلات', 'مكتب', 'مصنع', 'مخبز', 'مطعم', 'مقهى',
  'السيد', 'السيدة', 'الأستاذ', 'الاستاذ', 'الحاج', 'الحاجة', 'الدكتور', 'المهندس', 'العامة', 'العام',
  'ورثة', 'أبناء', 'وأبناؤه', 'للتجارة', 'للاستثمار', 'والتجارة',
]);

const DIACRITICS = /[ً-ٰٟـ]/g;

export function partyInitials(name: string | null | undefined): string {
  const words = String(name ?? '')
    .replace(DIACRITICS, '')
    .replace(/[()[\]{}"'«»,،.\-_/\\]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return '';

  const meaningful = words.filter((w) => !GENERIC_WORDS.has(w));
  const pool = meaningful.length > 0 ? meaningful : words;

  const letters = pool
    .slice(0, 2)
    .map((w) => {
      // «الأفق» → «أ»: the article is not part of the name (unless it is all there is)
      const bare = w.length > 3 && w.startsWith('ال') ? w.slice(2) : w;
      return Array.from(bare)[0] ?? '';
    })
    .filter(Boolean);
  return letters.map((l) => l.toUpperCase()).join(' ');
}
