/**
 * CI guard: the cold backup must cover every table the schema creates.
 *
 *   node scripts/verify-backup-coverage.mjs
 *
 * Reads the SQL in supabase/migrations and docs/proposed-migrations (no database), and src/lib/backup/tables.ts.
 * Fails when:
 *  - a public table is neither backed up nor excluded with a written reason (the way rent price bands, payroll,
 *    leave and the cashbox count were silently left out of every backup);
 *  - the backup list names a table the schema does not create (a typo that would back up nothing);
 *  - paging uses a column other than the table's primary key, or the table has no usable single-column key;
 *  - the list is not parents-first (kept readable and safe for any tool that reads it in order);
 *  - the restore tool grows a hand-kept table list again (it must sort by the database's foreign keys).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const problems = [];
const fail = (message) => problems.push(message);

// ── schema ──────────────────────────────────────────────────────────────────────────────────────────────
const stripComments = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');

function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of text) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

function blockAfter(sql, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < sql.length; i += 1) {
    if (sql[i] === '(') depth += 1;
    else if (sql[i] === ')') {
      depth -= 1;
      if (depth === 0) return sql.slice(openIndex + 1, i);
    }
  }
  return sql.slice(openIndex + 1);
}

/** @returns {Map<string, { file: string, primaryKey: string[], parents: Set<string> }>} */
export function readSchema(root = ROOT) {
  const tables = new Map();
  const dirs = ['supabase/migrations', 'docs/proposed-migrations'];
  const files = dirs.flatMap((dir) =>
    readdirSync(join(root, dir))
      .filter((f) => f.endsWith('.sql') && !f.includes('ROLLBACK'))
      .sort()
      .map((f) => ({ dir, f })),
  );

  for (const { dir, f } of files) {
    const sql = stripComments(readFileSync(join(root, dir, f), 'utf8'));
    const create = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(\w+)\.)?"?(\w+)"?\s*\(/gi;
    let match;
    while ((match = create.exec(sql))) {
      const schema = match[1] ?? 'public';
      if (schema !== 'public') continue;
      const name = match[2];
      const inner = blockAfter(sql, match.index + match[0].length - 1);
      const parents = new Set();
      let primaryKey = [];
      for (const part of splitTopLevel(inner)) {
        for (const ref of part.matchAll(/REFERENCES\s+(?:(\w+)\.)?"?(\w+)"?/gi)) {
          if ((ref[1] ?? 'public') === 'public') parents.add(ref[2]);
        }
        const tableLevel = /^(?:CONSTRAINT\s+\S+\s+)?PRIMARY\s+KEY\s*\(([^)]*)\)/i.exec(part);
        if (tableLevel) {
          primaryKey = tableLevel[1].split(',').map((c) => c.trim().replace(/"/g, ''));
          continue;
        }
        const inline = /^"?(\w+)"?\s+[\s\S]*\bPRIMARY\s+KEY\b/i.exec(part);
        if (inline && !/^(CONSTRAINT|UNIQUE|CHECK|FOREIGN)\b/i.test(part)) primaryKey = [inline[1]];
      }
      tables.set(name, { file: `${dir}/${f}`, primaryKey, parents });
    }
    const alter = /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?:(\w+)\.)?"?(\w+)"?([^;]*?)REFERENCES\s+(?:(\w+)\.)?"?(\w+)"?/gi;
    while ((match = alter.exec(sql))) {
      if ((match[1] ?? 'public') !== 'public' || (match[4] ?? 'public') !== 'public') continue;
      tables.get(match[2])?.parents.add(match[5]);
    }
  }
  return tables;
}

// ── the backup list ─────────────────────────────────────────────────────────────────────────────────────
export function readBackupConfig(root = ROOT) {
  const source = readFileSync(join(root, 'src/lib/backup/tables.ts'), 'utf8');
  const listBody = /COLD_BACKUP_TABLES\s*=\s*\[([\s\S]*?)\]\s*as const/.exec(source)?.[1];
  const excludedBody = /BACKUP_EXCLUDED_TABLES[^=]*=\s*\{([\s\S]*?)\n\};/.exec(source)?.[1];
  const orderBody = /COLD_BACKUP_ORDER_BY[^=]*=\s*\{([\s\S]*?)\};/.exec(source)?.[1];
  if (!listBody) throw new Error('COLD_BACKUP_TABLES not found in src/lib/backup/tables.ts');
  return {
    listed: [...listBody.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]),
    excluded: Object.fromEntries([...(excludedBody ?? '').matchAll(/([a-z0-9_]+)\s*:\s*'([^']*)'/g)].map((m) => [m[1], m[2]])),
    orderBy: Object.fromEntries([...(orderBody ?? '').matchAll(/([a-z0-9_]+)\s*:\s*'([a-z0-9_]+)'/g)].map((m) => [m[1], m[2]])),
  };
}

function main() {
  const schema = readSchema();
  const { listed, excluded, orderBy } = readBackupConfig();
  const listedSet = new Set(listed);

  if (new Set(listed).size !== listed.length) {
    fail(`قائمة النسخ فيها أسماء مكررة: ${listed.filter((t, i) => listed.indexOf(t) !== i).join(', ')}`);
  }
  for (const table of schema.keys()) {
    if (!listedSet.has(table) && !(table in excluded)) {
      fail(`الجدول ${table} (${schema.get(table).file}) ليس في COLD_BACKUP_TABLES ولا في BACKUP_EXCLUDED_TABLES — لن يدخل أي نسخة احتياطية`);
    }
  }
  for (const table of listed) {
    if (!schema.has(table)) fail(`COLD_BACKUP_TABLES تذكر ${table} وليس في أي هجرة (خطأ إملائي؟)`);
    if (table in excluded) fail(`${table} مذكور في القائمة وفي المستثنى معاً`);
  }
  for (const [table, reason] of Object.entries(excluded)) {
    if (!schema.has(table)) fail(`المستثنى ${table} ليس في أي هجرة`);
    if (reason.trim().length < 10) fail(`الاستثناء ${table} بلا سبب مكتوب كافٍ`);
  }

  // paging column = primary key
  for (const table of listed) {
    const info = schema.get(table);
    if (!info) continue;
    if (info.primaryKey.length !== 1) {
      fail(`الجدول ${table}: المفتاح الأساسي [${info.primaryKey.join(', ') || 'غير موجود'}] ليس عموداً واحداً — الترقيم المستقر يحتاج معالجة`);
      continue;
    }
    const expected = orderBy[table] ?? 'id';
    if (info.primaryKey[0] !== expected) {
      fail(`الجدول ${table}: مفتاحه الأساسي ${info.primaryKey[0]} لكن النسخة ترتّب بـ ${expected} (أضفه إلى COLD_BACKUP_ORDER_BY)`);
    }
  }
  for (const table of Object.keys(orderBy)) if (!listedSet.has(table)) fail(`COLD_BACKUP_ORDER_BY يذكر ${table} وهو ليس في القائمة`);

  // parents first
  listed.forEach((table, index) => {
    for (const parent of schema.get(table)?.parents ?? []) {
      if (parent === table || !listedSet.has(parent)) continue;
      if (listed.indexOf(parent) > index) fail(`الترتيب: ${table} يسبق أباه ${parent} في COLD_BACKUP_TABLES`);
    }
  });

  // the restore tool must not keep its own list again
  for (const file of ['scripts/restore-cold-backup.mjs', 'scripts/lib/cold-restore.mjs']) {
    const text = readFileSync(join(ROOT, file), 'utf8');
    if (/\b(TABLE_ORDER|RESTORE_ORDER|CONFLICT_KEY)\b\s*=/.test(text)) {
      fail(`${file} يحوي قائمة جداول أو مفاتيح يدوية؛ الترتيب والمفاتيح تُقرأ من القاعدة الهدف`);
    }
  }

  if (problems.length) {
    console.error(`verify:backup-coverage — ${problems.length} problem(s):`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(
    `verify:backup-coverage OK — ${schema.size} schema tables: ${listed.length} backed up, ${Object.keys(excluded).length} excluded with a reason, paging by primary key, parents first.`,
  );
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('verify-backup-coverage.mjs')) main();
