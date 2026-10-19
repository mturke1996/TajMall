/**
 * Keeps the people screens (vendors, customers, landlords, employees, payroll, their PDFs) written the way an
 * accountant's tool is written, and free of anything that reads as generated. It reads the real syntax tree of
 * every file in the people area, so comments are never judged and every finding names a file and a line.
 *
 * It fails on, in text people see (strings, templates, JSX text, aria-labels, placeholders, toasts, PDF text):
 *  - the words ذكي / ذكاء / الذكاء / ذكية / مساعد / اصطناعي, and AI / smart / copilot / assistant in any text;
 *  - promotional or filler words (احترافي, مذهل, بكل سهولة, مدعوم …);
 *  - an exclamation mark;
 *  - an em dash used as punctuation («—»; a lone «—» standing for an empty value is fine);
 *  - an emoji or a decorative glyph (✓ ✔ ★ ✨ ⚡ and the whole pictograph blocks);
 *  - setup talk (migration, Supabase, SQL, RLS, error codes) and leftovers (lorem, TODO, undefined, NaN);
 *  - a count typed next to its noun by hand instead of arabicCount(), or a numeral that disagrees with its
 *    noun («3 شهر», «12 أشهر»);
 *  - the retired names «بطاقة الجهة» / «بطاقة الموظف» (the page of a contact is «ملف الجهة»);
 *  - a single string of more than 220 characters (copy that long is a paragraph, not a label).
 * and in imports and class names:
 *  - the AI-style icons (Sparkles, Wand, Bot, Brain, Stars …) from any icon package;
 *  - generated-looking decoration: animate-pulse / ping / bounce, shimmer, glow, gradient text, mask fades.
 *    (gradients, blur and heavy shadows are already refused for all of src by verify-design-tokens.mjs.)
 *
 * The rules are tested on small fixtures first (a rule that stops firing would otherwise pass in silence).
 * Run: node scripts/verify-people-wording.mjs
 */
import ts from 'typescript';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// ---------------------------------------------------------------------------------------------------------
// what counts as the people area
// ---------------------------------------------------------------------------------------------------------

/** Whole folders (every .ts / .tsx below them). */
const DIRS = [
  'src/components/people',
  'src/components/contacts',
  'src/components/employees',
  'src/components/payroll',
  'src/app/(app)/contacts',
  'src/app/(app)/employees',
  'src/app/(app)/payroll',
  'src/app/ui-kit/people',
  'src/lib/contacts',
  'src/lib/people',
  'src/lib/employees',
];

/** Single files that belong to the area (screens that delegate to it, the data layer, the people PDFs). */
const FILES = [
  'src/components/mall/panels/people-panel.tsx',
  'src/components/mall/panels/employees-panel.tsx',
  'src/components/mall/people-segment-nav.tsx',
  'src/components/dashboard/follow-up-card.tsx',
  'src/lib/leave.ts',
  'src/lib/landlord-dues.ts',
  'src/lib/landlord-profile.ts',
  'src/lib/follow-up.ts',
  'src/lib/user-messages.ts',
  'src/lib/db/leave-queries.ts',
  'src/lib/db/landlord-dues-queries.ts',
  'src/lib/db/payroll-queries.ts',
  'src/features/pdf/ContactDossierPDF.tsx',
  'src/features/pdf/PartyStatementPDF.tsx',
  'src/features/pdf/PartyTotalsReportPDF.tsx',
  'src/features/pdf/PayslipPDF.tsx',
  'src/features/pdf/PayrollRegisterPDF.tsx',
];

// ---------------------------------------------------------------------------------------------------------
// the rules
// ---------------------------------------------------------------------------------------------------------

const AR = /[\u0600-\u06FF]/;
// Arabic words end at the first non-Arabic character; a prefix (و ف ب ك ل ال لل) may stand in front
const word = (alternatives) => new RegExp(`(?<![\\u0600-\\u06FF])(?:[وفبك]?ال|لل|[وفبكل])?(?:${alternatives})(?![\\u0600-\\u06FF])`);

const AI_WORDS_AR = word('ذكي|ذكية|ذكياً|أذكياء|ذكاء|مساعد|مساعدة ذكية|اصطناعي|اصطناعية|اصطناعياً');
const AI_WORDS_LATIN = /\bA\.?I\.?\b|artificial|\bsmart\b|intelligen|copilot|assistant|chat-?bot|\bGPT\b|\bLLM\b|machine learning|\bmagic(al)?\b/i;
const MARKETING = word(
  'احترافي|احترافية|مذهل|مذهلة|سحري|سحرية|رائع|رائعة|ممتاز|بجودة عالية|بكل سهولة|بسهولة تامة|بضغطة زر|بضغطة واحدة|استمتع|تجربة مميزة|حلول متكاملة|مدعوم|متطور|ثوري|فريد من نوعه|الأفضل في|الأذكى',
);
const FILLER = /\bpowered by\b|\bseamless(ly)?\b|\bunlock\b|\bsupercharge/i;
const SETUP_JARGON = /\bmigrations?\b|Supabase|\bRLS\b|\bRPC\b|PostgREST|PGRST\d|\bSQL(STATE)?\b|هجرة \d|تطبيق ترحيل|ترحيل قاعدة|ترحيل \d{3}|\b0\d{2}_[a-z]/i;
const LEFTOVER = /lorem ipsum|\bTODO\b|\bFIXME\b|\bXXX\b|\bundefined\b|\bNaN\b|\[object |\bnull\b/i;
// pictographs, dingbats (✓ ✔ ✗ ★ ☆ ✨ ⚡ ☑ ❤ …), the symbol blocks and the emoji variation selector
const EMOJI = /[\u{1F000}-\u{1FFFF}\u2600-\u27BF\u2B00-\u2BFF\uFE0F]|\p{Emoji_Presentation}/u;
const EM_DASH = /—/;
// one name for one thing: the contact's own page is «ملف الجهة» (the screens said «بطاقة الجهة» and «بطاقة الموظف» before)
const RETIRED_TERMS = /بطاقة الجهة|بطاقة الموظف/;

/** Icons that signal generated content, in any icon package. Zap (electricity) and Siren (emergency leave) are not on the list. */
const AI_ICON =
  /^(Sparkle|Sparkles|SparklesIcon|SparkleIcon|Wand|Wand2|WandSparkles|WandIcon|Magic\w*|Robot\w*|Bot|Bot[A-Z]\w*|Brain\w*|Stars?|StarsIcon|Cpu|CircuitBoard|Lightbulb\w*|Rocket\w*|PartyPopper|Gem|Crown|Orbit|Atom|Smile|Laugh|ThumbsUp|MessageCircleHeart)$/;

/** Class names that make a screen look generated. Spinners (animate-spin) are a loading signal, not decoration. */
const AI_CLASS = /(?<![\w-])(?:[a-z0-9-]+:)*(?:animate-(?:pulse|ping|bounce)|shimmer|glow|bg-clip-text|text-transparent|mask-(?:image|linear|radial)|bg-conic|aurora)(?![\w-])/;

/** Attributes whose string value is shown to a person or read out by a screen reader. */
const TEXT_ATTRS = new Set([
  'aria-label', 'aria-description', 'aria-roledescription', 'aria-valuetext', 'title', 'placeholder', 'alt', 'label',
  'description', 'hint', 'tooltip', 'emptyLabel', 'subtitle', 'heading', 'text', 'message', 'helper', 'openLabel', 'submitLabel',
]);

// nouns a count is written next to: singular (what 3 to 10 must NOT be followed by) and plural (what 11+ must NOT be followed by)
const SINGULAR = 'شهر|يوم|موظف|حركة|دفعة|ملف|جهة|مؤجر|معاملة|سلفة|طلب|قسط|إجازة|عميل|مورد|مستأجر|قيد|مطالبة|عقد|محل|راتب|سند|سنة';
const PLURAL = 'أشهر|أيام|موظفين|موظفون|حركات|دفعات|ملفات|جهات|مؤجرين|مؤجرون|معاملات|سلف|طلبات|أقساط|إجازات|عملاء|موردين|موردون|مستأجرين|مستأجرون|قيود|مطالبات|عقود|محلات|رواتب|سندات|سنوات';
const COUNTED_NOUN = new RegExp(`^\\s*(?:${SINGULAR}|${PLURAL})(?![\\u0600-\\u06FF])`);
const FEW_THEN_SINGULAR = new RegExp(`(?<![\\d.,/:-])\\b(?:[3-9]|10)\\s+(?:${SINGULAR})(?![\\u0600-\\u06FF])`);
const MANY_THEN_PLURAL = new RegExp(`(?<![\\d.,/:-])\\b(?:1[1-9]|[2-9]\\d|\\d{3,})\\s+(?:${PLURAL})(?![\\u0600-\\u06FF])`);

const MAX_LENGTH = 220;

const hasArabic = (s) => AR.test(s);

/**
 * Every piece of text in a file, with its line. kind: str (string literal), tpl (one chunk of a template),
 * jsx (JSX text), imp (an imported name), count-after (the text right after a value inside a template).
 * visible: it is, or may be, shown to a person (it has Arabic letters, or it sits in a text attribute).
 */
function collect(sf) {
  const out = [];
  const lineOf = (node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  const attrNameOf = (node) => (node.parent && ts.isJsxAttribute(node.parent) ? node.parent.name.getText(sf) : null);
  // a lone «—» between two values is a separator; on its own in a cell (or next to a screen-reader text) it stands for an empty value
  const isPlaceholderCell = (node) => {
    const kids = node.parent.children.filter((c) => !(ts.isJsxText(c) && !c.text.trim()));
    return kids.length === 1 || kids.some((c) => ts.isJsxElement(c) && /sr-only/.test(c.openingElement.getText(sf)));
  };

  const visit = (node) => {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      const names = [];
      if (clause?.name) names.push(clause.name.text);
      const nb = clause?.namedBindings;
      if (nb && ts.isNamedImports(nb)) for (const e of nb.elements) names.push((e.propertyName ?? e.name).text);
      if (nb && ts.isNamespaceImport(nb)) names.push(nb.name.text);
      for (const name of names) out.push({ kind: 'imp', text: name, line: lineOf(node), visible: false });
      return; // the module path is not text
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const attr = attrNameOf(node);
      out.push({ kind: 'str', text: node.text, line: lineOf(node), visible: hasArabic(node.text) || (attr !== null && TEXT_ATTRS.has(attr)) });
    } else if (ts.isTemplateExpression(node)) {
      const chunks = [node.head, ...node.templateSpans.map((s) => s.literal)];
      const visible = chunks.some((c) => hasArabic(c.text));
      for (const c of chunks) out.push({ kind: 'tpl', text: c.text, line: lineOf(c), visible });
      for (const span of node.templateSpans) {
        out.push({ kind: 'count-after', text: span.literal.text, line: lineOf(span.literal), visible, expr: span.expression.getText(sf) });
      }
    } else if (ts.isJsxText(node) && node.text.trim()) {
      const sibs = node.parent.children;
      const prev = sibs[sibs.indexOf(node) - 1];
      const afterValue = Boolean(prev && ts.isJsxExpression(prev));
      out.push({
        kind: 'jsx',
        text: node.text,
        line: lineOf(node),
        visible: true,
        placeholderCell: isPlaceholderCell(node),
        afterValue,
        valueExpr: afterValue ? (prev.expression?.getText(sf) ?? '') : '',
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** Every finding in one file's text: [{ line, rule, text }]. */
export function scanSource(fileName, text) {
  const kind = fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);
  const found = [];
  const add = (line, rule, snippet) => found.push({ line, rule, text: String(snippet).replace(/\s+/g, ' ').trim().slice(0, 110) });

  for (const p of collect(sf)) {
    const t = p.text;
    if (p.kind === 'imp') {
      if (AI_ICON.test(t)) add(p.line, 'AI-style icon', `import ${t}`);
      continue;
    }
    if (p.kind === 'count-after') {
      if (p.visible && COUNTED_NOUN.test(p.text) && !/arabicCount|Count\(|Label\(|Word\(/.test(p.expr)) {
        add(p.line, 'count typed by hand, use arabicCount()', `\${${p.expr}}${p.text.slice(0, 30)}`);
      }
      continue;
    }
    // class names and any other string: generated-looking decoration
    if (AI_CLASS.test(t)) add(p.line, 'generated-looking decoration', t);
    if (EMOJI.test(t)) add(p.line, 'emoji or decorative glyph', t);
    // a dash between two values (`${a} — ${b}`) has no Arabic of its own, so this is judged on every piece of text
    if (EM_DASH.test(t)) {
      const placeholder = (p.kind === 'str' && t === '—') || (p.kind === 'jsx' && t.trim() === '—' && p.placeholderCell);
      if (!placeholder) add(p.line, 'em dash as punctuation (use a full stop, a colon or ·)', t);
    }
    if (!p.visible) continue;

    if (AI_WORDS_AR.test(t)) add(p.line, 'AI wording (Arabic)', t);
    if (AI_WORDS_LATIN.test(t)) add(p.line, 'AI wording', t);
    if (MARKETING.test(t) || FILLER.test(t)) add(p.line, 'promotional or filler wording', t);
    if (/[!！]/.test(t)) add(p.line, 'exclamation mark', t);
    if (SETUP_JARGON.test(t)) add(p.line, 'setup talk shown to people', t);
    if (LEFTOVER.test(t)) add(p.line, 'leftover placeholder', t);
    if (RETIRED_TERMS.test(t)) add(p.line, 'retired term (the page of a contact is «ملف الجهة»)', t);
    if (p.kind === 'str' && t.length > MAX_LENGTH) add(p.line, `string over ${MAX_LENGTH} characters`, t);
    if (FEW_THEN_SINGULAR.test(t)) add(p.line, 'numeral and noun disagree (3 to 10 takes the plural)', t);
    if (MANY_THEN_PLURAL.test(t)) add(p.line, 'numeral and noun disagree (11 and over takes the singular)', t);

    if (p.kind === 'jsx' && p.afterValue && COUNTED_NOUN.test(t) && !/arabicCount|Count\(|Label\(|Word\(/.test(p.valueExpr)) {
      add(p.line, 'count typed by hand, use arabicCount()', `{${p.valueExpr}}${t.slice(0, 30)}`);
    }
  }
  return found.sort((a, b) => a.line - b.line);
}

// ---------------------------------------------------------------------------------------------------------
// the rules are tested first: a rule that no longer fires would let everything through
// ---------------------------------------------------------------------------------------------------------

function selfTest() {
  const rules = (code, name = 'fixture.tsx') => scanSource(name, code).map((f) => f.rule);
  const has = (code, rule) => assert.ok(rules(code).some((r) => r.startsWith(rule)), `expected «${rule}» in: ${code}`);
  const clean = (code) => assert.deepEqual(rules(code), [], `expected nothing in: ${code}`);

  has(`const a = 'مساعد ذكي لإعداد الملف';`, 'AI wording (Arabic)');
  has(`const a = 'تعمل بالذكاء الاصطناعي';`, 'AI wording (Arabic)');
  has(`const a = <p>Powered by AI</p>;`, 'AI wording');
  has(`const a = <p>ملف احترافي</p>;`, 'promotional');
  has(`const a = 'تم الحفظ!';`, 'exclamation');
  has(`const a = 'حُفظ — شكراً';`, 'em dash');
  has('const a = `${x} — ${y}`;', 'em dash');
  has(`const a = <p>{x} — {y}</p>;`, 'em dash');
  has(`const a = 'تم الحفظ ✓';`, 'emoji');
  has(`const a = <p>تم 🎉</p>;`, 'emoji');
  has(`import { Sparkles } from 'lucide-react';`, 'AI-style icon');
  has(`import { Wand2 as W } from 'lucide-react';`, 'AI-style icon');
  has(`import { Bot } from 'lucide-react';`, 'AI-style icon');
  has(`import { BrainCircuit } from 'lucide-react';`, 'AI-style icon');
  has(`const a = <div className="animate-pulse" />;`, 'generated-looking');
  has(`const a = <div className="bg-clip-text text-transparent" />;`, 'generated-looking');
  has(`const a = 'طبّق ترحيل قاعدة البيانات';`, 'setup talk');
  has(`const a = 'تعذّر: PGRST202 في Supabase';`, 'setup talk');
  has('const a = `${n} موظفين`;', 'count typed by hand');
  has(`const a = <p>{n} موظفين</p>;`, 'count typed by hand');
  has(`const a = 'مدة 5 شهر';`, 'numeral and noun disagree');
  has(`const a = 'مدة 12 أشهر';`, 'numeral and noun disagree');
  has(`const a = '${'ا'.repeat(230)}';`, 'string over');
  has(`const a = <p>غير معرّف undefined</p>;`, 'leftover');
  has(`const a = 'من بطاقة الجهة';`, 'retired term');
  has(`const a = 'يُحفظ على بطاقة الموظف';`, 'retired term');

  // what must stay allowed
  clean(`// مساعد ذكي ✓ — تم! Sparkles animate-pulse
/* بدون ذكاء — تعليق */
const a = 1;`);
  clean(`import { Zap, Siren, Hourglass, Building2, HandCoins } from 'lucide-react';`);
  clean(`const a = '—';`);
  clean(`const a = <td>—</td>;`);
  clean(`const a = <td>—<span className="sr-only">تعذّر التحميل</span></td>;`);
  clean(`const a = arabicCount(n, ['موظف واحد', 'موظفان', 'موظفين', 'موظفاً']);`);
  clean('const a = `${arabicCount(n, ["شهر", "شهرين", "أشهر", "شهراً"])} غير مصروفة`;');
  clean('const a = `${n} من ${total}`;');
  clean(`const a = 'آخر 12 شهراً';`);
  clean(`const a = 'خلال 30 يوماً وبعد 3 أشهر وشهرين و10 أيام';`);
  clean(`const a = '07 يوليو و10 يونيو';`);
  clean(`const a = <Loader2 className="animate-spin" aria-hidden />;`);
  clean(`const a = { code: 'PGRST202', note: 'x' };`);
  clean('const a = `${a} – ${b}`;');
  clean(`const a = 'مساعدة';`);
  clean(`const a = 'سند صرف: ما دُفع للمورد، وما تبقى للمؤجر.';`);
  clean(`const a = 'ملف الجهة وبطاقة ائتمان';`);
}

// ---------------------------------------------------------------------------------------------------------
// the scan
// ---------------------------------------------------------------------------------------------------------

function* walkDir(dir) {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walkDir(path);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) yield path;
  }
}

function run() {
  selfTest();

  const files = [];
  const missing = [];
  for (const d of DIRS) {
    const abs = join(ROOT, d);
    if (!existsSync(abs)) missing.push(d);
    else files.push(...walkDir(abs));
  }
  for (const f of FILES) {
    const abs = join(ROOT, f);
    if (!existsSync(abs)) missing.push(f);
    else files.push(abs);
  }
  if (missing.length) {
    console.error(`${missing.join('\n')}\n\n✗ verify-people-wording: ${missing.length} path(s) of the people area no longer exist; update the list in this script`);
    process.exit(1);
  }
  if (files.length < 100) {
    console.error(`✗ verify-people-wording: only ${files.length} files found, expected the whole people area (100+)`);
    process.exit(1);
  }

  const failures = [];
  for (const abs of files) {
    const rel = abs.replace(ROOT, '');
    for (const f of scanSource(rel, readFileSync(abs, 'utf8'))) failures.push(`${rel}:${f.line}  ${f.rule}  →  ${f.text}`);
  }

  if (failures.length) {
    console.error(failures.join('\n'));
    console.error(`\n✗ verify-people-wording: ${failures.length} problem(s) in ${files.length} files`);
    process.exit(1);
  }
  console.log(`✓ verify-people-wording: ${files.length} files, no AI wording or icons, emoji, em dashes, exclamation marks, setup talk or hand-typed counts`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) run();
