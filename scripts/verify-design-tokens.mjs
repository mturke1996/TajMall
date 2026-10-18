/**
 * Keeps the design system from drifting back. Fails when screen code (not PDFs) uses:
 *  - raw Tailwind palette colours (bg-emerald-50, text-rose-700 …) instead of the status tokens
 *    (success / danger / warning / info / plum) or the neutral tokens — raw colours ignore dark mode;
 *  - the legacy hard-coded sage-* greys;
 *  - letter-spacing or uppercase, which pull joined Arabic letters apart;
 *  - a + / − typed outside formatMoney, which lands on the wrong side of the amount in RTL;
 *  - text below 11px (hard to read in Arabic);
 *  - decoration that reads as generated: gradients, blur/glass, heavy or hover shadows, scale/lift on hover,
 *    staggered entrance animations, white overlays that break dark mode, marketing words;
 *  - setup instructions (migration numbers, Supabase dashboard) in text people see.
 * Run: node scripts/verify-design-tokens.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../src/', import.meta.url).pathname;
// PDF documents (react-pdf style objects) and the dev-only gallery are not screen code; the PDF
// toolbar and export dialogs under features/pdf are, so only files that render a PDF are skipped.
const SKIP = ['app/ui-kit'];
const isPdfDocument = (text) => /^\s*import\b[^;]*from\s+['"]@react-pdf\/renderer['"]/m.test(text);

const RULES = [
  {
    name: 'raw palette colour',
    rx: /(?<![\w/-])(?:[a-z0-9-]+:)*(?:text|bg|border(?:-[trblxyse])?|ring|divide|outline|from|via|to|fill|stroke|accent|shadow)-(?:red|rose|emerald|green|teal|lime|amber|yellow|orange|blue|sky|indigo|cyan|violet|purple|fuchsia|pink|slate|gray|zinc|neutral|stone|sage)-\d{2,3}\b/,
  },
  { name: 'letter-spacing on Arabic', rx: /(?<![\w-])(?:[a-z0-9-]+:)*tracking-(?:wide|wider|widest|\[[0-9.]+em\])(?![\w-])/ },
  { name: 'uppercase', rx: /(?<![\w-])(?:[a-z0-9-]+:)*uppercase(?![\w-])/, codeOnly: true },
  // Arabic script needs more size than Latin to stay legible; 11px is the smallest text size.
  { name: 'text smaller than 11px', rx: /(?<![\w-])(?:[a-z0-9-]+:)*text-\[(?:[0-9]|10)(?:\.\d+)?px\]/ },
  { name: 'sign outside formatMoney', rx: /['"]?[+−]['"]?\s*\}?\s*\{?\s*formatMoney\(|[+−]\{formatMoney\(/ },
  // Decoration that makes screens look generated rather than designed (DESIGN.md: no gradients, glass,
  // heavy shadows; colour carries meaning; floating layers use shadow-lift).
  { name: 'gradient', rx: /(?<![\w-])(?:[a-z0-9-]+:)*bg-(?:gradient|linear|radial|conic)-|<linearGradient|<radialGradient/ },
  { name: 'blur / glass', rx: /(?<![\w-])(?:[a-z0-9-]+:)*(?:backdrop-blur(?:-(?:none|xs|sm|md|lg|xl|2xl|3xl))?|blur-(?:sm|md|lg|xl|2xl|3xl))(?![\w-])/ },
  { name: 'heavy shadow', rx: /(?<![\w-])(?:[a-z0-9-]+:)*(?:shadow-(?:md|lg|xl|2xl)|drop-shadow-\w+)(?![\w-])/ },
  { name: 'hover lift', rx: /(?<![\w-])(?:hover|group-hover):(?:scale-|-?translate-y-|shadow-)/ },
  { name: 'entrance animation', rx: /animationDelay|staggerChildren|animate-fade-up|initial=\{\{\s*opacity/ },
  { name: 'white overlay (breaks dark mode)', rx: /(?<![\w-])(?:[a-z0-9-]+:)*(?:bg|text|ring|border)-white\/\d+/ },
  { name: 'marketing copy', rx: /احترافي|بجودة عالية|ممتاز!|رائع!|مذهل|سحري/, codeOnly: true },
  { name: 'setup jargon shown to users', rx: /هجرة \d|migration \d{3}|في Supabase|لوحة Supabase/, codeOnly: true },
];

// Places where a rule does not apply: first-run setup speaks to the administrator who installs the system.
const ALLOW = {
  'setup jargon shown to users': ['app/setup/'],
  // a transient floating notice may slide in; page content may not
  'entrance animation': ['components/pwa/install-hint'],
};

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
  const text = readFileSync(file, 'utf8');
  if (isPdfDocument(text)) continue;
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    const isComment = trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*');
    for (const rule of RULES) {
      if (isComment && rule.codeOnly !== false) continue;
      if ((ALLOW[rule.name] ?? []).some((a) => file.includes(a))) continue;
      if (rule.rx.test(line)) failures.push(`${file.replace(ROOT, 'src/')}:${i + 1}  ${rule.name}  →  ${trimmed.slice(0, 110)}`);
    }
  });
}

if (failures.length) {
  console.error(failures.join('\n'));
  console.error(`\n✗ verify-design-tokens: ${failures.length} problem(s)`);
  process.exit(1);
}
console.log('✓ verify-design-tokens: no raw colours, Arabic letter-spacing, detached signs, decorative effects or setup jargon');
