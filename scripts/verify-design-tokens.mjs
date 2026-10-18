/**
 * Keeps the design system from drifting back. Fails when screen code (not PDFs) uses:
 *  - raw Tailwind palette colours (bg-emerald-50, text-rose-700 …) instead of the status tokens
 *    (success / danger / warning / info / plum) or the neutral tokens — raw colours ignore dark mode;
 *  - the legacy hard-coded sage-* greys;
 *  - letter-spacing or uppercase, which pull joined Arabic letters apart;
 *  - a + / − typed outside formatMoney, which lands on the wrong side of the amount in RTL.
 * Run: node scripts/verify-design-tokens.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../src/', import.meta.url).pathname;
const SKIP = ['features/pdf', 'app/ui-kit'];

const RULES = [
  {
    name: 'raw palette colour',
    rx: /(?<![\w/-])(?:[a-z0-9-]+:)*(?:text|bg|border(?:-[trblxyse])?|ring|divide|outline|from|via|to|fill|stroke|accent|shadow)-(?:red|rose|emerald|green|teal|lime|amber|yellow|orange|blue|sky|indigo|cyan|violet|purple|fuchsia|pink|slate|gray|zinc|neutral|stone|sage)-\d{2,3}\b/,
  },
  { name: 'letter-spacing on Arabic', rx: /(?<![\w-])(?:[a-z0-9-]+:)*tracking-(?:wide|wider|widest|\[[0-9.]+em\])(?![\w-])/ },
  { name: 'uppercase', rx: /(?<![\w-])(?:[a-z0-9-]+:)*uppercase(?![\w-])/, codeOnly: true },
  { name: 'sign outside formatMoney', rx: /['"]?[+−]['"]?\s*\}?\s*\{?\s*formatMoney\(|[+−]\{formatMoney\(/ },
];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (SKIP.some((s) => path.includes(s))) continue;
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (/\.(tsx|ts)$/.test(name)) yield path;
  }
}

const failures = [];
for (const file of walk(ROOT)) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    const isComment = trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*');
    for (const rule of RULES) {
      if (isComment && rule.codeOnly !== false) continue;
      if (rule.rx.test(line)) failures.push(`${file.replace(ROOT, 'src/')}:${i + 1}  ${rule.name}  →  ${trimmed.slice(0, 110)}`);
    }
  });
}

if (failures.length) {
  console.error(failures.join('\n'));
  console.error(`\n✗ verify-design-tokens: ${failures.length} problem(s)`);
  process.exit(1);
}
console.log('✓ verify-design-tokens: no raw colours, Arabic letter-spacing or detached signs');
