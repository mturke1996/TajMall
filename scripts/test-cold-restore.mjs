/**
 * Cold-backup restore: unit checks + a full round trip on isolated PGlite replicas. Never touches production.
 *
 *   node scripts/test-cold-restore.mjs
 *
 * What is proved here (each one is a bug the previous restore tool had or could have had):
 *  - the ZIP reader rejects corrupt / truncated / unsafe archives instead of restoring garbage;
 *  - table order comes from the database's foreign keys;
 *  - a backup restored into a blank, SEEDED database equals the source, row for row, with no doubled ledger;
 *  - a bad row aborts everything and leaves the database exactly as it was (the old tool printed "Done");
 *  - the first new transaction after a restore does not collide on its serial number;
 *  - a database that already holds business data is refused.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { deflateRawSync } from 'node:zlib';
import { join, resolve } from 'node:path';
import { createReplica, actAs } from './lib/pglite-replica.mjs';
import { crc32, readZip, ZipError } from './lib/zip-reader.mjs';
import { ARCHIVE_FORMAT, BUSINESS_DATA_TABLES, RestoreError, orderTables, parseArchive, restoreArchive } from './lib/cold-restore.mjs';

const results = [];
const check = (area, name, ok, detail = '') => results.push({ area, name, ok: Boolean(ok), detail: String(detail ?? '') });
const attempt = async (fn) => {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    return { ok: false, error };
  }
};
const throwsWith = async (fn, ErrorClass, pattern) => {
  const r = await attempt(fn);
  return !r.ok && r.error instanceof ErrorClass && (!pattern || pattern.test(r.error.message));
};

// ── tiny ZIP writer used only by this test (the app writes real ones from Rust) ──────────────────────────
function makeZip(entries, { tamper } = {}) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    const method = entry.method ?? 8;
    const body = method === 8 ? deflateRawSync(data) : data;
    const crc = entry.crc ?? crc32(data);
    const flags = (entry.flags ?? 0) | 0x800;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(entry.declaredSize ?? data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, body);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(entry.declaredSize ?? data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += 30 + name.length + body.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  const buf = Buffer.concat([...locals, centralBuf, end]);
  return tamper ? tamper(buf) : buf;
}
const sha = (s) => createHash('sha256').update(s).digest('hex');
const json = (v) => JSON.stringify(v, null, 2);


/** The shape `npm run db:snapshot` writes: `tar -a -c -f x.zip -C dir .` names, directory entries, manifest.tables map. */
function makeSnapshotArchive(tables, { tamperHash = false } = {}) {
  const files = Object.entries(tables).map(([name, rows]) => ({ name, body: JSON.stringify(rows) }));
  const manifest = {
    id: 'snapshot-2026-11-15T00-00-00-000Z',
    createdAt: '2026-11-15T00:00:00.000Z',
    format: 'fluxen-cold-backup-v1+schema',
    source: 'scripts/backup-database-snapshot.mjs',
    tables: Object.fromEntries(files.map((f, i) => [f.name, { rows: tables[f.name].length, sha256: tamperHash && i === 0 ? 'e'.repeat(64) : sha(f.body) }])),
    schema: { functions: { rows: 0, sha256: sha('[]') } },
  };
  return makeZip([
    { name: './', data: '', method: 0 },
    { name: './tables/', data: '', method: 0 },
    { name: './manifest.json', data: JSON.stringify(manifest, null, 2) },
    ...files.map((f) => ({ name: `./tables/${f.name}.json`, data: f.body })),
    { name: './schema/functions.json', data: '[]' },
  ]);
}

function makeArchive(tables, { manifestPatch = {}, withHashes = true } = {}) {
  const files = Object.entries(tables).map(([name, rows]) => ({ name: `tables/${name}.json`, body: json(rows) }));
  const manifest = {
    id: '20260101T000000Z',
    createdAt: '2026-01-01T00:00:00Z',
    appVersion: 'test',
    format: ARCHIVE_FORMAT,
    tableCounts: Object.fromEntries(Object.entries(tables).map(([n, r]) => [n, r.length])),
    ...(withHashes ? { tableSha256: Object.fromEntries(files.map((f) => [f.name.slice(7, -5), sha(f.body)])) } : {}),
    ...manifestPatch,
  };
  return makeZip([{ name: 'manifest.json', data: json(manifest) }, ...files.map((f) => ({ name: f.name, data: f.body }))]);
}

// ── 1. ZIP reader ────────────────────────────────────────────────────────────────────────────────────────
{
  const zip = makeZip([
    { name: 'a.txt', data: 'hello hello hello hello hello', method: 8 },
    { name: 'dir/b.txt', data: 'stored', method: 0 },
    { name: 'dir/', data: '', method: 0 },
  ]);
  const map = readZip(zip);
  check('zip', 'يقرأ عنصراً مضغوطاً وآخر مخزناً ويتجاهل المجلدات',
    map.get('a.txt')?.toString() === 'hello hello hello hello hello' && map.get('dir/b.txt')?.toString() === 'stored' && map.size === 2);
  check('zip', 'CRC تالف يُرفض', await throwsWith(() => readZip(makeZip([{ name: 'a', data: 'abc', crc: 1 }])), ZipError, /CRC/));
  check('zip', 'ملف مبتور يُرفض', await throwsWith(() => readZip(zip.subarray(0, zip.length - 30)), ZipError));
  check('zip', 'ملف ليس ZIP يُرفض', await throwsWith(() => readZip(Buffer.from('not a zip file at all, just text.')), ZipError));
  check('zip', 'اسم يعبر المسار (zip slip) يُرفض', await throwsWith(() => readZip(makeZip([{ name: '../evil.json', data: '{}' }])), ZipError, /غير آمن/));
  check('zip', 'مسار مطلق يُرفض', await throwsWith(() => readZip(makeZip([{ name: '/etc/passwd', data: 'x' }])), ZipError, /غير آمن/));
  check('zip', 'اسم بشرطة عكسية يُرفض', await throwsWith(() => readZip(makeZip([{ name: 'a\\..\\b', data: 'x' }])), ZipError, /غير آمن/));
  check('zip', 'اسم مكرر يُرفض', await throwsWith(() => readZip(makeZip([{ name: 'a', data: '1' }, { name: 'a', data: '2' }])), ZipError, /مكرر/));
  check('zip', 'عنصر مشفّر يُرفض', await throwsWith(() => readZip(makeZip([{ name: 'a', data: 'x', flags: 1 }])), ZipError, /مشفّر/));
  check('zip', 'قنبلة ضغط (حجم معلن أصغر من الحقيقي) تُرفض',
    await throwsWith(() => readZip(makeZip([{ name: 'a', data: Buffer.alloc(100000, 7), declaredSize: 10 }])), ZipError));
  check('zip', 'عدد عناصر يتجاوز الحد يُرفض', await throwsWith(() => readZip(zip, { maxEntries: 1 }), ZipError, /الحد/));
  const dotted = readZip(makeZip([{ name: './', data: '', method: 0 }, { name: './tables/', data: '', method: 0 }, { name: './manifest.json', data: '{}' }, { name: './././tables/a.json', data: '[]' }]));
  check('zip', 'بادئة "./" (من tar -a) تُحذف والمجلدات تُتجاهل', dotted.has('manifest.json') && dotted.has('tables/a.json') && dotted.size === 2, [...dotted.keys()].join(','));
  check('zip', '"./../evil" ما زال يُرفض بعد حذف "./"', await throwsWith(() => readZip(makeZip([{ name: './../evil.json', data: '{}' }])), ZipError, /غير آمن/));
}

// ── 2. archive validation ───────────────────────────────────────────────────────────────────────────────
{
  const good = makeArchive({ branches: [{ id: '1', name: 'a' }], categories: [] });
  const parsed = parseArchive(good);
  check('archive', 'أرشيف سليم يُقرأ بجدوله وعدد صفوفه', parsed.tables.size === 2 && parsed.tables.get('branches').length === 1);
  check('archive', 'أرشيف بلا صيغة معروفة يُرفض', await throwsWith(() => parseArchive(makeArchive({ branches: [] }, { manifestPatch: { format: 'other' } })), RestoreError, /صيغة/));
  check('archive', 'بصمة جدول معدَّلة تُرفض', await throwsWith(() => {
    const files = [{ name: 'manifest.json', data: json({ format: ARCHIVE_FORMAT, tableCounts: { branches: 1 }, tableSha256: { branches: 'f'.repeat(64) } }) },
      { name: 'tables/branches.json', data: json([{ id: '1' }]) }];
    return parseArchive(makeZip(files));
  }, RestoreError, /SHA-256/));
  check('archive', 'عدد صفوف لا يطابق البيان (أرشيف مبتور) يُرفض', await throwsWith(() => {
    const files = [{ name: 'manifest.json', data: json({ format: ARCHIVE_FORMAT, tableCounts: { branches: 5 } }) },
      { name: 'tables/branches.json', data: json([{ id: '1' }]) }];
    return parseArchive(makeZip(files));
  }, RestoreError, /لا يطابق/));
  check('archive', 'جدول مذكور في البيان بلا ملف يُرفض', await throwsWith(() => parseArchive(makeZip([
    { name: 'manifest.json', data: json({ format: ARCHIVE_FORMAT, tableCounts: { branches: 0, ghost: 0 } }) },
    { name: 'tables/branches.json', data: '[]' }])), RestoreError, /ناقص/));
  check('archive', 'اسم جدول خبيث يُرفض', await throwsWith(() => parseArchive(makeZip([
    { name: 'manifest.json', data: json({ format: ARCHIVE_FORMAT }) },
    { name: 'tables/x";drop table y;--.json', data: '[]' }])), RestoreError, /غير صالح/));
  check('archive', 'أرشيف قديم بلا بصمات يُقبل بعد فحص CRC والأعداد', parseArchive(makeArchive({ branches: [{ id: '1' }] }, { withHashes: false })).tables.size === 1);
  check('archive', 'عنصر ليس صفاً يُرفض', await throwsWith(() => parseArchive(makeArchive({ branches: [1, 2] })), RestoreError, /ليس صفاً/));

  const rustFixture = resolve('scripts/fixtures/cold-backup-v1.zip');
  if (existsSync(rustFixture)) {
    const fx = parseArchive(readFileSync(rustFixture));
    check('archive', 'أرشيف كتبه كود Rust الفعلي يُقرأ ويتحقق (بصمات + أعداد)', fx.tables.size >= 2 && Boolean(fx.manifest.tableSha256),
      `tables=${fx.tables.size}`);
  } else {
    check('archive', 'أرشيف Rust النموذجي موجود', false, 'scripts/fixtures/cold-backup-v1.zip غير موجود');
  }
}

// ── 2b. the archive `npm run db:snapshot` writes (the manual backup taken before any migration) ──────────────
{
  const snap = parseArchive(makeSnapshotArchive({ branches: [{ id: 'b1', name: 'الفرع' }], categories: [] }));
  check('snapshot', 'أرشيف db:snapshot (صيغة +schema وبيان tables وأسماء "./") يُقبل', snap.tables.size === 2 && snap.manifest.format === 'fluxen-cold-backup-v1+schema');
  check('snapshot', 'ويُتحقق من بصمة كل جدول فيه', await throwsWith(() => parseArchive(makeSnapshotArchive({ branches: [{ id: 'b1' }], categories: [] }, { tamperHash: true })), RestoreError, /SHA-256/));
  check('snapshot', 'وعدد الصفوف المعلَن', await throwsWith(() => parseArchive(makeZip([
    { name: './manifest.json', data: JSON.stringify({ format: 'fluxen-cold-backup-v1+schema', tables: { branches: { rows: 9 } } }) },
    { name: './tables/branches.json', data: '[{"id":"1"}]' }])), RestoreError, /لا يطابق/));
  const bsdtar = resolve('scripts/fixtures/snapshot-bsdtar-v1.zip');
  check('snapshot', 'ملف حقيقي كتبه bsdtar (نفس tar.exe في ويندوز) يُقرأ ويُتحقق منه', existsSync(bsdtar) && (() => {
    const a = parseArchive(readFileSync(bsdtar));
    return a.tables.size === 2 && a.tables.get('branches')[0].name === 'الفرع الرئيسي';
  })());
}

// ── 2c. the command line (no database needed for --verify-only) ─────────────────────────────────────────────────
{
  const CLI = resolve('scripts/restore-cold-backup.mjs');
  const cli = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: { ...process.env, DIRECT_URL: '', DATABASE_URL: '' } });
  const rust = resolve('scripts/fixtures/cold-backup-v1.zip');
  const snapZip = resolve('scripts/fixtures/snapshot-bsdtar-v1.zip');
  let r = cli([rust, '--verify-only']);
  check('cli', '--verify-only يقبل نسخة التطبيق دون أي قاعدة بيانات', r.status === 0 && /Archive is intact/.test(r.stdout), `${r.status} ${r.stderr}`);
  r = cli([snapZip, '--verify-only']);
  check('cli', '--verify-only يقبل نسخة npm run db:snapshot', r.status === 0 && /Archive is intact/.test(r.stdout), `${r.status} ${r.stderr}`);
  const broken = join(tmpdir(), `fluxen-broken-${process.pid}.zip`);
  writeFileSync(broken, readFileSync(rust).subarray(0, 300));
  r = cli([broken, '--verify-only']);
  check('cli', 'ملف مبتور يُرفض برمز 1 ورسالة واضحة', r.status === 1 && /الأرشيف مرفوض/.test(r.stderr), `${r.status} ${r.stderr}`);
  r = cli([]);
  check('cli', 'بلا وسائط: شرح الاستعمال ورمز 1', r.status === 1 && /Usage/.test(r.stderr));
  r = cli([rust, '--bogus']);
  check('cli', 'خيار غير معروف يُرفض', r.status === 1 && /خيار غير معروف/.test(r.stderr));
  r = cli([rust]);
  check('cli', 'استعادة فعلية بلا DIRECT_URL تتوقف قبل أي اتصال', r.status === 1 && /DIRECT_URL/.test(r.stderr), r.stderr);
}

// ── 3. ordering ─────────────────────────────────────────────────────────────────────────────────────────
{
  const edges = [
    { child: 'lines', parent: 'entries' },
    { child: 'entries', parent: 'periods' },
    { child: 'tree', parent: 'tree' },
    { child: 'other', parent: 'not_restored' },
  ];
  const { order, selfReferencing } = orderTables(['lines', 'tree', 'entries', 'periods', 'other'], edges);
  check('order', 'الآباء قبل الأبناء والاعتماد الذاتي مُعلَن', order.indexOf('periods') < order.indexOf('entries') && order.indexOf('entries') < order.indexOf('lines') && selfReferencing.has('tree'), order.join('>'));
  check('order', 'الترتيب حتمي', orderTables(['b', 'a', 'c'], []).order.join() === 'a,b,c');
  check('order', 'الدورة تُكتشف', await throwsWith(() => orderTables(['x', 'y'], [{ child: 'x', parent: 'y' }, { child: 'y', parent: 'x' }]), RestoreError, /دورة/));
}

// ── 4. round trip on replicas ───────────────────────────────────────────────────────────────────────────
const tablesTs = readFileSync(resolve('src/lib/backup/tables.ts'), 'utf8');
const LISTED = [...(/COLD_BACKUP_TABLES = \[([\s\S]*?)\] as const/.exec(tablesTs)?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
check('setup', 'قائمة النسخ الاحتياطي قُرئت', LISTED.length >= 30, `count=${LISTED.length}`);

const PROPOSED = ['078_security_and_ledger_fixes', '080_payroll', '081_rent_safety', '082_role_and_voucher_guards', '083_employee_leave', '084_rent_summary_respects_claim_start']
  .map((f) => `docs/proposed-migrations/${f}.sql`);

async function buildReplica(label) {
  const started = Date.now();
  const { db } = await createReplica();
  for (const file of PROPOSED) {
    const r = await attempt(() => db.exec(readFileSync(file, 'utf8')));
    check('setup', `${label}: تطبيق ${file.split('/').pop()}`, r.ok, r.error?.message ?? '');
    if (!r.ok) {
      try { await db.exec('ROLLBACK'); } catch { /* ignore */ }
    }
  }
  console.log(`  ${label} ready in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  return db;
}

const SRC = await buildReplica('المصدر');
const rows = async (db, sql, p) => (await db.query(sql, p)).rows;
const val = async (db, sql, p) => Object.values((await rows(db, sql, p))[0] ?? {})[0];
const n = (x) => Number(x ?? 0);

// fixtures through the same RPCs the UI uses
await actAs(SRC, 'superuser');
const OWNER = '11111111-1111-4111-8111-111111111111';
const ACCOUNTANT = '44444444-4444-4444-8444-444444444444';
await SRC.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'owner@test.local'), ($2, 'acc@test.local')`, [OWNER, ACCOUNTANT]);
await SRC.query(`SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false)`);
await SRC.query(`INSERT INTO profiles (id, role, full_name_ar) VALUES ($1, 'owner', 'المالك'), ($2, 'accountant', 'المحاسب') ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role`, [OWNER, ACCOUNTANT]);
const cat = Object.fromEntries((await rows(SRC, `SELECT code, id FROM categories`)).map((r) => [r.code, r.id]));
const boxes = await rows(SRC, `SELECT id, kind FROM cashboxes WHERE active ORDER BY code`);
const CASH = boxes.find((b) => b.kind === 'CASH')?.id;
const BANK = boxes.find((b) => b.kind === 'BANK')?.id;
const pgArray = (a) => `{${a.map((s) => `"${s}"`).join(',')}}`;

await actAs(SRC, 'authenticated', OWNER);
const contact = async (payload) => {
  const r = await val(SRC, `SELECT create_contact($1::jsonb)`, [JSON.stringify(payload)]);
  return r?.id ?? r?.contact?.id ?? r;
};
const T1 = await contact({ kind: 'TENANT', name: 'مستأجر اختبار 1', shop_number: 'TST-101', monthly_rent: 1000 });
const T2 = await contact({ kind: 'TENANT', name: 'مستأجر اختبار 2', shop_number: 'TST-102', monthly_rent: 2000 });
const V1 = await contact({ kind: 'VENDOR', name: 'مورد اختبار' });
const E1 = await contact({ kind: 'EMPLOYEE', name: 'موظف اختبار', job_title: 'محاسب', hire_date: '2025-06-01' });
for (const t of [T1, T2]) await val(SRC, `SELECT ensure_tenant_lease_contract($1)`, [t]);
const YEAR = new Date().getUTCFullYear();
const EXP_CAT = cat['EXP-MNT'] ?? (await val(SRC, `SELECT id FROM categories WHERE type = 'EXPENSE' AND active LIMIT 1`));
const REV_CAT = cat['REV-PRK'] ?? cat['REV-OTH'];
const steps = {
  bands: await attempt(() => val(SRC, `SELECT set_tenant_rent_price_bands($1, $2::jsonb)`, [T2, JSON.stringify([{ from_month: '2026-04', to_month: '2026-12', amount: 2500 }])])),
  // the database makes rent charges for the CURRENT year only, so the months follow the year the test runs in
  // (hard-coded 2026 months made this step fail from 1 January 2027)
  rent: await attempt(() => val(SRC, `SELECT record_rent_payment($1, 2000, $4::date, $2, NULL, $3::text[], 'CASH')`, [T1, CASH, pgArray([`${YEAR}-03`, `${YEAR}-04`]), `${YEAR}-04-10`])),
  revenue: await attempt(() => val(SRC, `INSERT INTO transactions (kind, status, method, amount, currency, tx_date, description, category_id, cashbox_id, created_by, posted_at, auto_allocate_charges)
      VALUES ('REVENUE','POSTED','CASH',750.500,'LYD','2026-04-12','إيراد اختبار',$1,$2,$3,now(),true) RETURNING id`, [REV_CAT, CASH, OWNER])),
  expense: await attempt(() => val(SRC, `INSERT INTO transactions (kind, status, method, amount, currency, tx_date, description, category_id, cashbox_id, contact_id, created_by, posted_at, auto_allocate_charges)
      VALUES ('EXPENSE','POSTED','CASH',120.250,'LYD','2026-04-13','مصروف اختبار',$1,$2,$3,$4,now(),true) RETURNING id`, [EXP_CAT, CASH, V1, OWNER])),
  transfer: await attempt(() => val(SRC, `SELECT record_cashbox_transfer($1, $2, 200, '2026-04-14', 'تحويل اختبار', NULL)`, [CASH, BANK])),
  salary: await attempt(() => val(SRC, `SELECT payroll_set_salary($1, '2026-01-01', 2000, 300, 0, 0, 'تعيين')`, [E1])),
  bonus: await attempt(() => val(SRC, `SELECT payroll_add_adjustment($1, '2026-03', 'BONUS', 500, 'مكافأة')`, [E1])),
};
const prep = await attempt(() => val(SRC, `SELECT payroll_prepare_run('2026-03')`));
steps.prepare = prep;
if (prep.ok) {
  steps.approve = await attempt(() => val(SRC, `SELECT payroll_approve_run($1)`, [prep.value.run_id]));
  steps.post = await attempt(() => val(SRC, `SELECT payroll_post_run($1)`, [prep.value.run_id]));
}
steps.leave = await attempt(() => val(SRC, `SELECT employee_leave_request($1, 'ANNUAL', '2026-06-01'::date, '2026-06-03'::date, 'اختبار', true, NULL)`, [E1]));
for (const [k, r] of Object.entries(steps)) check('fixtures', `إنشاء بيانات المصدر: ${k}`, r.ok, r.error?.message ?? '');

await actAs(SRC, 'superuser');
const hasRows = async (t) => n(await val(SRC, `SELECT count(*) FROM public."${t}"`));
const counts = Object.fromEntries(await Promise.all(LISTED.map(async (t) => [t, await attempt(() => hasRows(t)).then((r) => (r.ok ? r.value : null))])));
const covered = ['contacts', 'transactions', 'journal_entries', 'journal_lines', 'tenant_charges', 'tenant_rent_journal_links', 'cash_transfers', 'tenant_rent_price_bands', 'payroll_runs', 'payroll_run_lines', 'employee_leave_requests'];
for (const t of covered) check('fixtures', `بيانات حقيقية في ${t}`, (counts[t] ?? 0) > 0, `rows=${counts[t]}`);
console.log(`  source rows: ${LISTED.filter((t) => counts[t]).map((t) => `${t}=${counts[t]}`).join(' ')}`);

// take the backup the way the app does: every listed table, contacts without the portal token
const missingInSource = LISTED.filter((t) => counts[t] === null);
check('fixtures', 'كل جداول القائمة موجودة في مخطط المصدر', missingInSource.length === 0, missingInSource.join(','));
const backup = {};
for (const t of LISTED.filter((t) => counts[t] !== null)) {
  const data = (await rows(SRC, `SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) AS data FROM public."${t}" x`))[0].data;
  backup[t] = JSON.parse(JSON.stringify(data));
  if (t === 'contacts') for (const r of backup[t]) delete r.portal_token;
}
const archive = parseArchive(makeArchive(backup));

// the blank target: same schema, seeded by migrations, with the Auth users that profiles point to
const DST = await buildReplica('الهدف');
await actAs(DST, 'superuser');
const srcAuth = await rows(SRC, `SELECT id, email FROM auth.users`);
for (const u of srcAuth) await DST.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [u.id, u.email]);
await DST.query(`SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false)`);
const seedCats = n(await val(DST, `SELECT count(*) FROM categories`));
check('target', 'الهدف يحوي بذور الهجرات (حالة مشروع جديد)', seedCats > 0, `categories=${seedCats}`);
const seededBusiness = [];
for (const t of BUSINESS_DATA_TABLES) if (n(await val(DST, `SELECT count(*) FROM public."${t}"`)) > 0) seededBusiness.push(t);
check('target', 'جداول فحص «القاعدة فارغة» لا تُبذَر بالهجرات', seededBusiness.length === 0, seededBusiness.join(','));

const snapshot = async (db) => {
  const out = {};
  for (const t of LISTED) {
    const exists = await val(db, `SELECT to_regclass('public.${t}') IS NOT NULL`);
    if (!exists) continue;
    out[t] = n(await val(db, `SELECT count(*) FROM public."${t}"`));
  }
  return out;
};
const stateOf = async (db) => ({
  counts: await snapshot(db),
  journalSum: n(await val(db, `SELECT coalesce(sum(debit), 0) - coalesce(sum(credit), 0) FROM journal_lines`)),
  cash: n(await val(db, `SELECT coalesce(sum(debit - credit), 0) FROM journal_lines jl JOIN categories c ON c.id = jl.category_id AND c.code = 'AST-CSH'`)),
});

// 4a. negative control: triggers left enabled MUST be caught (this is what doubled the ledger before)
{
  const leaky = {
    query: (sql, params) => (/DISABLE TRIGGER USER/.test(sql) ? Promise.resolve({ rows: [] }) : DST.query(sql, params)),
  };
  const before = await stateOf(DST);
  const r = await attempt(() => restoreArchive(leaky, archive, { eraseExisting: true }));
  const after = await stateOf(DST);
  check('control', 'عنصر ضبط سلبي: لو بقيت المشغّلات فعّالة يفشل التحقق ويُلغى كل شيء',
    !r.ok && r.error instanceof RestoreError && JSON.stringify(before) === JSON.stringify(after), r.ok ? 'restore succeeded unexpectedly' : r.error.message.slice(0, 160));
}

// 4b. the real restore
const log = [];
const restored = await attempt(() => restoreArchive(DST, archive, { log: (l) => log.push(l) }));
check('restore', 'الاستعادة على هدف جديد (ببذور) تنجح', restored.ok, restored.error?.message ?? '');
if (restored.ok) {
  const r = restored.value;
  check('restore', 'المعاملة اُعتمدت بلا أي فشل', r.committed && r.failureCount === 0, `failures=${r.failureCount}`);
  check('restore', 'الجداول رُتّبت آباءً قبل أبناء', r.order.indexOf('contacts') < r.order.indexOf('transactions') && r.order.indexOf('journal_entries') < r.order.indexOf('journal_lines')
    && r.order.indexOf('payroll_runs') < r.order.indexOf('payroll_run_lines'), r.order.join('>'));
  const src = await stateOf(SRC);
  const dst = await stateOf(DST);
  const diffCounts = Object.keys(src.counts).filter((t) => src.counts[t] !== dst.counts[t]);
  check('restore', 'أعداد كل الجداول مطابقة للمصدر', diffCounts.length === 0, diffCounts.map((t) => `${t}:${src.counts[t]}≠${dst.counts[t]}`).join(' '));
  check('restore', 'لا تضاعف في دفتر الأستاذ: مجموع المدين−الدائن وصافي النقد مطابقان', Math.abs(src.journalSum - dst.journalSum) < 1e-6 && Math.abs(src.cash - dst.cash) < 1e-6,
    `src=${src.journalSum}/${src.cash} dst=${dst.journalSum}/${dst.cash}`);

  // row-for-row equality (numbers compared numerically, everything else as JSON)
  const canon = (value) => JSON.stringify(value, (_k, v) => (typeof v === 'number' ? Number(v.toFixed(6)) : v));
  const mismatches = [];
  for (const t of LISTED.filter((t) => counts[t])) {
    const pk = (await rows(DST, `SELECT a.attname FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = $1::regclass AND i.indisprimary ORDER BY a.attnum`, [`public.${t}`])).map((x) => x.attname);
    const order = pk.map((c) => `"${c}"`).join(', ') || '1';
    const a = (await rows(SRC, `SELECT to_jsonb(x) AS j FROM public."${t}" x ORDER BY ${pk.map((c) => `x."${c}"`).join(', ') || '1'}`)).map((x) => x.j);
    const b = (await rows(DST, `SELECT to_jsonb(x) AS j FROM public."${t}" x ORDER BY ${pk.map((c) => `x."${c}"`).join(', ') || '1'}`)).map((x) => x.j);
    const strip = (rowsOf) => rowsOf.map((r) => { const copy = { ...r }; if (t === 'contacts') delete copy.portal_token; return copy; });
    if (canon(strip(a)) !== canon(strip(b))) {
      const i = strip(a).findIndex((row, idx) => canon(row) !== canon(strip(b)[idx]));
      mismatches.push(`${t}[${i}]`);
      if (mismatches.length <= 3) console.log(`   mismatch ${t} ordered by ${order}:\n   src=${canon(strip(a)[i])?.slice(0, 400)}\n   dst=${canon(strip(b)[i])?.slice(0, 400)}`);
    }
  }
  check('restore', 'محتوى كل صف مطابق للمصدر في كل الجداول', mismatches.length === 0, mismatches.join(', '));

  const disabled = n(await val(DST, `SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace
    WHERE ns.nspname = 'public' AND NOT t.tgisinternal AND t.tgenabled <> 'O'`));
  check('restore', 'المشغّلات أُعيد تفعيلها بعد التحميل', disabled === 0, `disabled=${disabled}`);

  // after the restore the application keeps working: a new transaction takes the next number and posts normally
  await actAs(DST, 'superuser');
  await DST.query(`SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false)`);
  const maxNumber = n(await val(DST, `SELECT max(number) FROM transactions`));
  const journalsBefore = n(await val(DST, `SELECT count(*) FROM journal_entries`));
  const cashDst = (await rows(DST, `SELECT id FROM cashboxes WHERE kind = 'CASH' AND active ORDER BY code LIMIT 1`))[0].id;
  const nextTx = await attempt(() => val(DST, `INSERT INTO transactions (kind, status, method, amount, currency, tx_date, description, category_id, cashbox_id, created_by, posted_at, auto_allocate_charges)
    VALUES ('REVENUE','POSTED','CASH',10,'LYD','2026-05-01','بعد الاستعادة',$1,$2,$3,now(),true) RETURNING number`, [cat['REV-PRK'] ?? cat['REV-OTH'], cashDst, OWNER]));
  check('restore', 'أول معاملة بعد الاستعادة تأخذ رقماً أكبر ولا تتعارض', nextTx.ok && n(nextTx.value) > maxNumber, nextTx.error?.message ?? `max=${maxNumber} next=${nextTx.value}`);
  check('restore', 'ومشغّل الترحيل يعمل بعد الاستعادة (قيد جديد واحد)', n(await val(DST, `SELECT count(*) FROM journal_entries`)) === journalsBefore + 1);
  await DST.query(`DELETE FROM transactions WHERE description = 'بعد الاستعادة'`).catch(() => {});
}

// 4c. guards on a database that now holds data
{
  const before = await stateOf(DST);
  check('guard', 'قاعدة فيها بيانات تُرفض دون eraseExisting',
    await throwsWith(() => restoreArchive(DST, archive, {}), RestoreError, /ليست فارغة/));
  check('guard', 'الرفض لا يغيّر شيئاً', JSON.stringify(before) === JSON.stringify(await stateOf(DST)));

  const dry = await attempt(() => restoreArchive(DST, archive, { eraseExisting: true, dryRun: true }));
  check('guard', 'التجربة الجافة تنجح وتُلغى (committed=false) دون تغيير', dry.ok && dry.value.committed === false && JSON.stringify(before) === JSON.stringify(await stateOf(DST)), dry.error?.message ?? '');

  // a bad row: a transaction pointing at a cashbox that does not exist
  const broken = structuredClone(backup);
  broken.transactions[0] = { ...broken.transactions[0], cashbox_id: '99999999-9999-4999-8999-999999999999' };
  const r1 = await attempt(() => restoreArchive(DST, parseArchive(makeArchive(broken)), { eraseExisting: true }));
  const afterBad = await stateOf(DST);
  const failure = r1.error?.details?.failures?.find((f) => f.table === 'transactions');
  check('guard', 'صف فاسد يُلغي الاستعادة كلها ويحدد الجدول والصف', !r1.ok && r1.error instanceof RestoreError && failure?.kind === 'row' && failure.row === 0,
    r1.ok ? 'restore succeeded unexpectedly' : JSON.stringify(failure ?? r1.error.message).slice(0, 200));
  check('guard', 'والقاعدة بقيت كما كانت تماماً بعد الإلغاء', JSON.stringify(before) === JSON.stringify(afterBad));

  const r2 = await attempt(() => restoreArchive(DST, parseArchive(makeArchive(broken)), { eraseExisting: true, allowPartial: true }));
  const afterPartial = await stateOf(DST);
  check('guard', 'allowPartial يعتمد ما نجح ويُبلغ بالفشل',
    r2.ok && r2.value.failureCount >= 1 && afterPartial.counts.transactions === before.counts.transactions - 1, r2.error?.message ?? `tx=${afterPartial.counts?.transactions}`);

  // restore the good data again for the remaining checks
  const again = await attempt(() => restoreArchive(DST, archive, { eraseExisting: true }));
  check('guard', 'استعادة سليمة فوق بيانات سابقة (eraseExisting) تعيد حالة المصدر نفسها',
    again.ok && JSON.stringify(await stateOf(SRC)) === JSON.stringify(await stateOf(DST)), again.error?.message ?? '');

  const extra = parseArchive(makeArchive({ ...backup, cafe_menu_items: [{ id: '1' }] }));
  const r3 = await attempt(() => restoreArchive(DST, extra, { eraseExisting: true }));
  check('guard', 'جدول في الأرشيف غير موجود في الهدف يُفشل الاستعادة', !r3.ok && r3.error.details.failures.some((f) => f.kind === 'table-missing'));

  const withColumn = structuredClone(backup);
  withColumn.branches = withColumn.branches.map((b) => ({ ...b, legacy_column: 'x' }));
  const r4 = await attempt(() => restoreArchive(DST, parseArchive(makeArchive(withColumn)), { eraseExisting: true }));
  check('guard', 'عمود في الأرشيف غير موجود في الهدف يُفشل الاستعادة (لا فقدان صامت)', !r4.ok && r4.error.details.failures.some((f) => f.kind === 'unknown-columns'));
}

// 4d. the manual backup (db:snapshot shape) restores exactly like the app's backup
{
  const viaSnapshot = await attempt(() => restoreArchive(DST, parseArchive(makeSnapshotArchive(backup)), { eraseExisting: true }));
  check('snapshot', 'استعادة أرشيف db:snapshot (أسماء "./" وبيان tables) تعطي حالة المصدر نفسها',
    viaSnapshot.ok && viaSnapshot.value.failureCount === 0 && JSON.stringify(await stateOf(SRC)) === JSON.stringify(await stateOf(DST)),
    viaSnapshot.error?.message ?? '');
}

// ── report ──────────────────────────────────────────────────────────────────────────────────────────────
let failed = 0;
let lastArea = '';
for (const r of results) {
  if (r.area !== lastArea) {
    console.log(`\n[${r.area}]`);
    lastArea = r.area;
  }
  if (!r.ok) failed += 1;
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${!r.ok && r.detail ? `\n      ${r.detail}` : ''}`);
}
console.log(`\n${results.length - failed} passed, ${failed} failed (${results.length} checks)`);
await SRC.close?.();
await DST.close?.();
process.exit(failed ? 1 : 0);
