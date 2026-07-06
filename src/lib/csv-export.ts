/**
 * تصدير CSV بسيط بدون أي مكتبة خارجية — بديل/إضافة لتصدير PDF لكل من
 * يحتاج فتح التقرير كأرقام خام في Excel/Sheets بدل قراءته كوثيقة.
 */

/** يهرب حقلاً واحداً حسب معيار CSV (RFC 4180). */
function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
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
