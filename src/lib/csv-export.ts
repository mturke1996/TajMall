/**
 * تصدير CSV بسيط بدون أي مكتبة خارجية — بديل/إضافة لتصدير PDF لكل من
 * يحتاج فتح التقرير كأرقام خام في Excel/Sheets بدل قراءته كوثيقة.
 */

/** A cell Excel/Sheets/LibreOffice would run as a formula: it starts with = + - @ or a tab / CR / LF / NUL. */
const FORMULA_START = /^[=+\-@\t\r\n\u0000]/;
/**
 * Plain numbers and phone-like text that happen to start with + or -: digits with spaces, dots, commas,
 * hyphens and parentheses and nothing else, so no function name, "|", "!" or "@" can be in it. Leaving
 * these alone keeps "-12.5", "+218 91 234 5678" and "-1,250.00" readable instead of showing a stray quote.
 */
const NUMBER_OR_PHONE_LIKE = /^[+-]?\d[\d ().,-]*$/;

/**
 * Neutralises CSV/formula injection ("=HYPERLINK(...)", "+cmd|' /C calc'!A0", "@SUM(...)") by prefixing an
 * apostrophe to any text cell that starts like a formula. JavaScript numbers are never text, so a negative
 * amount stays numeric. Every other type (a Date, an array, an object with a toString) is turned into text
 * first and gets the same check, since "=1+1" can arrive through String(value) as well.
 */
export function neutralizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  const s = String(value);
  if (FORMULA_START.test(s) && !NUMBER_OR_PHONE_LIKE.test(s)) return `'${s}`;
  return s;
}

/** يهرب حقلاً واحداً حسب معيار CSV (RFC 4180). */
function escapeCsvField(value: unknown): string {
  const s = neutralizeCsvCell(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildCsv(headers: string[], rows: Array<Array<unknown>>): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCsvField).join(','));
  // BOM في البداية ضروري ليفتح Excel على Windows الملف كـ UTF-8 ويعرض
  // العربية بشكل صحيح، بدل تفسيرها بترميز النظام المحلي فتظهر رموزاً.
  return '\uFEFF' + lines.join('\r\n');
}

export function downloadCsv(fileName: string, headers: string[], rows: Array<Array<unknown>>): void {
  const csv = buildCsv(headers, rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const name = fileName.endsWith('.csv') ? fileName : `${fileName}.csv`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
