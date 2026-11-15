#!/usr/bin/env node
/**
 * Is this computer ready to work on the project?   npm run preflight
 *
 * Checks the tools, the branch, the installed packages, the local environment file and the dev port, and says
 * what to do about each problem. It changes nothing. It NEVER prints a secret: for .env.local it reads only the
 * names of the keys and whether each value looks filled in.
 *
 * Exit code 1 only when something blocks all work (Node, npm, git, or an env file that git would commit).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import net from 'node:net';
import { join, resolve } from 'node:path';

const root = resolve(process.cwd());
const isWindows = process.platform === 'win32';
const rows = [];
const add = (level, title, detail = '', fix = '') => rows.push({ level, title, detail, fix });

/** Runs a command and returns its output, or null when it is missing or fails. */
function run(command, args) {
  try {
    return execFileSync(command, args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 20000,
      shell: isWindows, // npm is npm.cmd on Windows
    }).trim();
  } catch {
    return null;
  }
}

const major = (version) => Number(String(version ?? '').replace(/^v/, '').split('.')[0]);

// ── tools ────────────────────────────────────────────────────────────────────────────────────────────────
const nodeMajor = major(process.versions.node);
if (nodeMajor === 22) add('ok', 'Node.js', `v${process.versions.node}`);
else if (nodeMajor >= 20) add('warn', 'Node.js', `v${process.versions.node} — CI يختبر على الإصدار 22 فقط`, 'ثبّت Node.js 22 من nodejs.org لتطابق CI');
else add('bad', 'Node.js', `v${process.versions.node} قديم`, 'ثبّت Node.js 22 من nodejs.org');

const npmVersion = run('npm', ['-v']);
if (!npmVersion) add('bad', 'npm', 'غير موجود', 'يأتي مع Node.js: أعد تثبيته');
else if (major(npmVersion) >= 10) add('ok', 'npm', npmVersion);
else add('warn', 'npm', `${npmVersion} — المتوقع 10 أو أحدث`, 'npm install -g npm@10');

const gitVersion = run('git', ['--version']);
if (!gitVersion) add('bad', 'git', 'غير موجود', 'ثبّت Git من git-scm.com');
else add('ok', 'git', gitVersion.replace(/^git version /, ''));

// ── repository ───────────────────────────────────────────────────────────────────────────────────────────
const PLAN = 'docs/REMEDIATION-AND-DEVELOPMENT-PLAN-2026-11-14.md';
if (gitVersion) {
  const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (!branch) add('bad', 'مجلد المشروع', 'هذا ليس مستودع git', 'شغّل الأمر من داخل مجلد TajMall');
  else if (existsSync(join(root, PLAN))) add('ok', 'الفرع والخطة', `الفرع ${branch}، والخطة موجودة`);
  else add('warn', 'الفرع', `الفرع ${branch} لا يحوي الخطة`, 'git fetch origin && git checkout claude/vibrant-edison-r4u632');

  const dirty = run('git', ['status', '--porcelain']);
  if (dirty) add('warn', 'تغييرات غير محفوظة', `عدد الملفات المعدّلة: ${dirty.split('\n').length}`, 'git status ثم احفظها بـ commit أو أعدها قبل أن تبدأ مرحلة جديدة');
}

// ── packages ─────────────────────────────────────────────────────────────────────────────────────────────
if (!existsSync(join(root, 'node_modules', '.package-lock.json'))) {
  add('warn', 'الحزم', 'غير مثبّتة', 'npm ci');
} else if (!existsSync(join(root, 'node_modules', '.bin', isWindows ? 'tsx.cmd' : 'tsx'))) {
  add('warn', 'الحزم', 'ناقصة (tsx غير موجود): التثبيت قديم', 'npm ci');
} else {
  add('ok', 'الحزم', 'مثبّتة');
}

// ── local environment file (names only) ──────────────────────────────────────────────────────────────────
const envPath = join(root, '.env.local');
const PLACEHOLDER = /^(your[-_]|xxx|placeholder|generate-a-long|<|\[)|your-project-ref|YOUR_DB_PASSWORD/i;
if (!existsSync(envPath)) {
  add('warn', '.env.local', 'غير موجود (يلزم لتشغيل npm run dev وسكربتات القاعدة فقط)', 'انسخ .env.example إلى .env.local واملأ القيم من لوحة Supabase');
} else {
  const ignored = gitVersion ? run('git', ['check-ignore', '-q', '.env.local']) !== null : true;
  if (!ignored) {
    add('bad', '.env.local', 'غير مُتجاهَل في git: قد يُرفع بالخطأ وفيه أسرار', 'أضف السطر .env.local إلى .gitignore قبل أي commit');
  } else {
    const keys = new Map();
    for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const i = trimmed.indexOf('=');
      keys.set(trimmed.slice(0, i).trim(), trimmed.slice(i + 1).trim().replace(/^["']|["']$/g, ''));
    }
    const filled = (name) => keys.has(name) && keys.get(name).length > 0 && !PLACEHOLDER.test(keys.get(name));

    if (filled('NEXT_PUBLIC_SUPABASE_URL') && /^https?:\/\//.test(keys.get('NEXT_PUBLIC_SUPABASE_URL'))) {
      add('ok', 'NEXT_PUBLIC_SUPABASE_URL', 'مضبوط');
    } else {
      add('warn', 'NEXT_PUBLIC_SUPABASE_URL', 'ناقص أو قيمته توضيحية', 'Supabase ← Project Settings ← API ← Project URL');
    }
    if (filled('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') || filled('NEXT_PUBLIC_SUPABASE_ANON_KEY')) {
      add('ok', 'مفتاح Supabase العام', 'مضبوط');
    } else {
      add('warn', 'مفتاح Supabase العام', 'ناقص', 'Supabase ← Project Settings ← API ← publishable (أو anon) key');
    }
    add(
      filled('SUPABASE_SECRET_KEY') ? 'ok' : 'info',
      'SUPABASE_SECRET_KEY',
      filled('SUPABASE_SECRET_KEY') ? 'موجود (للمسارات الإدارية وبوابة المستأجر محلياً فقط)' : 'غير مضبوط: لا تعمل دعوة المستخدمين وبوابة المستأجر محلياً',
      'اختياري. لا تنسخه إلى أي مكان آخر ولا ترسله في محادثة',
    );
    const db = filled('DATABASE_URL') || filled('DIRECT_URL');
    add(db ? 'ok' : 'info', 'DATABASE_URL / DIRECT_URL', db ? 'مضبوط (لسكربتات db:snapshot و audit:* و الاستعادة)' : 'غير مضبوط: تحتاجه سكربتات القاعدة فقط', 'Supabase ← Project Settings ← Database ← Connection string');
  }
}

// ── dev port ─────────────────────────────────────────────────────────────────────────────────────────────
const portFree = await new Promise((done) => {
  const server = net.createServer();
  server.once('error', () => done(false));
  server.once('listening', () => server.close(() => done(true)));
  server.listen(3000, '127.0.0.1');
});
add(portFree ? 'ok' : 'warn', 'المنفذ 3000', portFree ? 'حرّ' : 'مشغول', 'npm run free-port');

// ── optional: desktop shell tools ────────────────────────────────────────────────────────────────────────
const cargo = run('cargo', ['--version']);
add(cargo ? 'ok' : 'info', 'Rust (cargo)', cargo ?? 'غير مثبّت — يلزم لغلاف سطح المكتب فقط (المرحلة W1)', 'winget install Rustlang.Rustup ثم أعد فتح الطرفية');
if (isWindows) add('info', 'ويندوز', 'استعمل Windows Terminal ليظهر النص العربي سليماً', 'اختبارات القاعدة تُشغَّل في CI بساعة ثابتة؛ على جهازك قد تتأثر بتاريخ اليوم (انظر الدليل)');

// ── report ───────────────────────────────────────────────────────────────────────────────────────────────
const MARK = { ok: '[ OK ]', warn: '[ !! ]', bad: '[ XX ]', info: '[ .. ]' };
console.log('\nفحص جاهزية الجهاز — تاج مول\n');
for (const r of rows) {
  console.log(`${MARK[r.level]} ${r.title}${r.detail ? ` — ${r.detail}` : ''}`);
  if (r.fix && r.level !== 'ok') console.log(`         ↳ ${r.fix}`);
}
const bad = rows.filter((r) => r.level === 'bad').length;
const warn = rows.filter((r) => r.level === 'warn').length;
console.log(`\n${bad ? `${bad} مشكلة تمنع العمل` : warn ? `لا شيء يمنع العمل، و${warn} تنبيه` : 'الجهاز جاهز'}.`);
console.log('الخطوة التالية: docs/EXECUTION-GUIDE-PC-2026-11-15.md (القسم 3).\n');
process.exit(bad ? 1 : 0);
