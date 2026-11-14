/**
 * Cold-backup restore engine (disaster recovery).
 *
 * Works with any client exposing `query(sql, params) -> { rows }` (node-postgres or PGlite), so the same code
 * is used by the command line tool and by the round-trip test on an isolated replica.
 *
 * What it guarantees, and why each point exists:
 *  - ALL OR NOTHING by default. Everything runs in one transaction; each chunk sits in a SAVEPOINT so a bad
 *    row is pinpointed instead of poisoning the whole transaction. (A plain `BEGIN ... COMMIT` around failing
 *    statements turns into a silent ROLLBACK while the script prints "Done".) Failures abort and roll back
 *    unless `allowPartial` is set explicitly.
 *  - The order of tables comes from the TARGET database's foreign keys (topological sort), not from a hand
 *    kept list, so a new table can never be restored in the wrong order or forgotten.
 *  - User triggers are disabled on the restored tables for the duration of the load. Otherwise inserting a
 *    transaction re-posts its journal entry and the archive's own journal rows then double the ledger.
 *  - Rows are loaded with jsonb_populate_recordset, so Postgres itself converts numerics, dates, arrays and
 *    jsonb (no hand-written type guessing).
 *  - The restored tables are emptied first (a fresh project already holds seed categories and cashboxes that
 *    would collide), but only after proving the target has no business data, unless `eraseExisting` is set.
 *  - Serial/identity sequences are moved past the restored maximum, otherwise the first new transaction after a
 *    restore fails on a duplicate `number`.
 *  - The archive is verified before anything is touched: ZIP CRC, per-table SHA-256 and row counts from the
 *    manifest when present.
 */
import { createHash } from 'node:crypto';
import { readZip } from './zip-reader.mjs';

export const ARCHIVE_FORMAT = 'fluxen-cold-backup-v1';
const TABLE_NAME = /^[a-z][a-z0-9_]{0,62}$/;

/**
 * Tables that migrations never seed: if any holds a row the target is not a blank database and the restore
 * refuses to continue (it would erase real data). `contacts` is NOT here on purpose: the migrations insert
 * default contacts, so a fresh project has some (the round-trip test proves the others stay empty).
 */
export const BUSINESS_DATA_TABLES = [
  'transactions',
  'journal_entries',
  'journal_lines',
  'tenant_charges',
  'cash_transfers',
  'disbursement_vouchers',
  'receipt_vouchers',
];

export class RestoreError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'RestoreError';
    this.details = details;
  }
}

const quote = (name) => `"${String(name).replace(/"/g, '""')}"`;
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** Validates and reads a cold-backup ZIP. Throws RestoreError / ZipError, never returns a half-read archive. */
export function parseArchive(buffer) {
  const entries = readZip(buffer);

  const rawManifest = entries.get('manifest.json');
  if (!rawManifest) throw new RestoreError('manifest.json غير موجود — ليس نسخة Fluxen احتياطية');
  let manifest;
  try {
    manifest = JSON.parse(rawManifest.toString('utf8'));
  } catch (error) {
    throw new RestoreError(`manifest.json تالف: ${error.message}`);
  }
  if (manifest?.format !== ARCHIVE_FORMAT) {
    throw new RestoreError(`صيغة الأرشيف غير معروفة: ${manifest?.format ?? '(بلا صيغة)'}`);
  }

  const hashes = manifest.tableSha256 && typeof manifest.tableSha256 === 'object' ? manifest.tableSha256 : null;
  const tables = new Map();

  for (const [entryName, data] of entries) {
    const match = /^tables\/([^/]+)\.json$/.exec(entryName);
    if (!match) continue;
    const table = match[1];
    if (!TABLE_NAME.test(table)) throw new RestoreError(`اسم جدول غير صالح في الأرشيف: ${JSON.stringify(table)}`);

    if (hashes) {
      const expected = hashes[table];
      if (typeof expected !== 'string') throw new RestoreError(`الجدول ${table} غير مسجَّل في بصمات البيان`);
      if (sha256(data) !== expected) throw new RestoreError(`بصمة SHA-256 للجدول ${table} لا تطابق البيان: الملف تالف أو معدَّل`);
    }

    let rows;
    try {
      rows = JSON.parse(data.toString('utf8'));
    } catch (error) {
      throw new RestoreError(`ملف الجدول ${table} ليس JSON صالحاً: ${error.message}`);
    }
    if (!Array.isArray(rows)) throw new RestoreError(`ملف الجدول ${table} ليس مصفوفة صفوف`);
    if (rows.some((row) => row === null || typeof row !== 'object' || Array.isArray(row))) {
      throw new RestoreError(`ملف الجدول ${table} يحوي عنصراً ليس صفاً`);
    }
    const declared = manifest.tableCounts?.[table];
    if (Number.isInteger(declared) && declared !== rows.length) {
      throw new RestoreError(`عدد صفوف ${table} (${rows.length}) لا يطابق البيان (${declared}): أرشيف مبتور`);
    }
    tables.set(table, rows);
  }

  for (const declaredTable of Object.keys(manifest.tableCounts ?? {})) {
    if (!tables.has(declaredTable)) throw new RestoreError(`الجدول ${declaredTable} مذكور في البيان وملفه غير موجود: أرشيف ناقص`);
  }
  return { manifest, tables };
}

/**
 * Parents-first order for `names` given foreign keys `edges` ({ child, parent }). Ties break alphabetically so
 * the order is deterministic. Self references are reported separately (a table pointing at itself).
 */
export function orderTables(names, edges) {
  const wanted = new Set(names);
  const parents = new Map(names.map((name) => [name, new Set()]));
  const selfReferencing = new Set();
  for (const { child, parent } of edges) {
    if (!wanted.has(child) || !wanted.has(parent)) continue;
    if (child === parent) selfReferencing.add(child);
    else parents.get(child).add(parent);
  }

  const order = [];
  const remaining = new Set(names);
  while (remaining.size) {
    const ready = [...remaining].filter((name) => [...parents.get(name)].every((p) => !remaining.has(p))).sort();
    if (!ready.length) {
      throw new RestoreError(`دورة اعتماد بين الجداول، لا يمكن ترتيبها: ${[...remaining].sort().join(', ')}`);
    }
    order.push(ready[0]);
    remaining.delete(ready[0]);
  }
  return { order, selfReferencing };
}

/** Every table that (transitively) references one of `roots`, excluding the roots themselves. */
function referencingClosure(roots, edges) {
  const closure = new Set();
  const frontier = [...roots];
  while (frontier.length) {
    const current = frontier.pop();
    for (const { child, parent } of edges) {
      if (parent === current && !roots.has(child) && !closure.has(child)) {
        closure.add(child);
        frontier.push(child);
      }
    }
  }
  return closure;
}

async function readCatalog(client) {
  const tables = (
    await client.query(
      `SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')`,
    )
  ).rows.map((row) => row.name);

  const edges = (
    await client.query(
      `SELECT cl.relname AS child, pl.relname AS parent
       FROM pg_constraint k
       JOIN pg_class cl ON cl.oid = k.conrelid JOIN pg_namespace cn ON cn.oid = cl.relnamespace AND cn.nspname = 'public'
       JOIN pg_class pl ON pl.oid = k.confrelid JOIN pg_namespace pn ON pn.oid = pl.relnamespace AND pn.nspname = 'public'
       WHERE k.contype = 'f'`,
    )
  ).rows;

  const columns = new Map();
  for (const row of (
    await client.query(
      `SELECT c.relname AS table_name, a.attname AS column_name, a.attgenerated::text <> '' AS is_generated
       FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
       WHERE c.relkind IN ('r', 'p') AND a.attnum > 0 AND NOT a.attisdropped`,
    )
  ).rows) {
    if (!columns.has(row.table_name)) columns.set(row.table_name, []);
    columns.get(row.table_name).push({ name: row.column_name, generated: row.is_generated });
  }

  const primaryKeys = new Map();
  for (const row of (
    await client.query(
      `SELECT cl.relname AS table_name, a.attname AS column_name, k.ord
       FROM pg_index i JOIN pg_class cl ON cl.oid = i.indrelid
       JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
       CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
       WHERE i.indisprimary ORDER BY cl.relname, k.ord`,
    )
  ).rows) {
    if (!primaryKeys.has(row.table_name)) primaryKeys.set(row.table_name, []);
    primaryKeys.get(row.table_name).push(row.column_name);
  }

  return { tables: new Set(tables), edges, columns, primaryKeys };
}

function buildInsertSql(table, columns, primaryKey) {
  const list = columns.map(quote).join(', ');
  const target = `public.${quote(table)}`;
  let sql =
    `INSERT INTO ${target} (${list}) OVERRIDING SYSTEM VALUE ` +
    `SELECT ${list} FROM jsonb_populate_recordset(NULL::${target}, $1::jsonb)`;
  if (primaryKey.length) {
    const updates = columns.filter((c) => !primaryKey.includes(c)).map((c) => `${quote(c)} = EXCLUDED.${quote(c)}`);
    sql += ` ON CONFLICT (${primaryKey.map(quote).join(', ')}) `;
    sql += updates.length ? `DO UPDATE SET ${updates.join(', ')}` : 'DO NOTHING';
  }
  return sql;
}

async function inSavepoint(client, name, work) {
  await client.query(`SAVEPOINT ${name}`);
  try {
    const result = await work();
    await client.query(`RELEASE SAVEPOINT ${name}`);
    return { ok: true, result };
  } catch (error) {
    await client.query(`ROLLBACK TO SAVEPOINT ${name}`);
    await client.query(`RELEASE SAVEPOINT ${name}`);
    return { ok: false, error };
  }
}

/**
 * Restores `archive` (from parseArchive) into the database behind `client`.
 *
 * @returns {Promise<{ committed: boolean, dryRun: boolean, order: string[], tables: object[], failures: object[], warnings: string[] }>}
 * @throws {RestoreError} when the restore is refused or fails; the transaction has been rolled back.
 */
export async function restoreArchive(client, archive, options = {}) {
  const { allowPartial = false, dryRun = false, eraseExisting = false, chunkSize = 500, log = () => {} } = options;
  const warnings = [];
  const failures = [];
  const report = [];
  const MAX_RECORDED_FAILURES = 200;
  const fail = (failure) => {
    if (failures.length < MAX_RECORDED_FAILURES) failures.push(failure);
  };
  let failureCount = 0;

  await client.query('BEGIN');
  try {
    const catalog = await readCatalog(client);
    const archiveTables = [...archive.tables.keys()].sort();

    const missing = archiveTables.filter((t) => !catalog.tables.has(t));
    for (const t of missing) {
      failureCount += 1;
      fail({ table: t, kind: 'table-missing', message: 'الجدول غير موجود في القاعدة الهدف: طبّق الهجرات أولاً' });
    }
    const present = archiveTables.filter((t) => catalog.tables.has(t));
    const { order, selfReferencing } = orderTables(present, catalog.edges);

    // 1) refuse to erase real data
    if (!eraseExisting) {
      for (const t of BUSINESS_DATA_TABLES) {
        if (!catalog.tables.has(t)) continue;
        const { rows } = await client.query(`SELECT EXISTS (SELECT 1 FROM public.${quote(t)}) AS has_rows`);
        if (rows[0].has_rows) {
          throw new RestoreError(
            `القاعدة الهدف ليست فارغة: الجدول ${t} يحوي بيانات. الاستعادة تمسح الجداول المستعادة أولاً. ` +
              'استعد على قاعدة جديدة، أو مرّر eraseExisting صراحةً إن كنت تريد استبدال البيانات.',
            { table: t },
          );
        }
      }
    }

    // 2) tables outside the archive that point at restored tables must be empty (TRUNCATE has to include them)
    const outside = [...referencingClosure(new Set(present), catalog.edges)];
    for (const t of outside) {
      const { rows } = await client.query(`SELECT EXISTS (SELECT 1 FROM public.${quote(t)}) AS has_rows`);
      if (rows[0].has_rows) {
        throw new RestoreError(
          `الجدول ${t} ليس في الأرشيف ويحوي بيانات وهو يشير إلى جداول سيُمسح محتواها. لا يمكن الاستعادة دون فقدانه.`,
          { table: t },
        );
      }
    }

    // 3) clean slate + triggers off for the load
    if (present.length) {
      const everything = [...present, ...outside].map((t) => `public.${quote(t)}`).join(', ');
      await client.query(`TRUNCATE TABLE ${everything}`);
      for (const t of present) await client.query(`ALTER TABLE public.${quote(t)} DISABLE TRIGGER USER`);
    }

    // 4) load, parents first
    for (const table of order) {
      const rows = archive.tables.get(table);
      const entry = { table, archive: rows.length, loaded: 0, failed: 0 };
      report.push(entry);
      if (!rows.length) {
        log(`- ${table}: 0`);
        continue;
      }

      const targetColumns = catalog.columns.get(table) ?? [];
      const writable = new Set(targetColumns.filter((c) => !c.generated).map((c) => c.name));
      const generated = new Set(targetColumns.filter((c) => c.generated).map((c) => c.name));
      const keys = new Set();
      for (const row of rows) for (const k of Object.keys(row)) keys.add(k);

      const unknown = [...keys].filter((k) => !writable.has(k) && !generated.has(k));
      if (unknown.length) {
        failureCount += 1;
        fail({
          table,
          kind: 'unknown-columns',
          message: `أعمدة في الأرشيف غير موجودة في القاعدة الهدف (ستضيع بياناتها): ${unknown.join(', ')}`,
        });
      }
      const columns = [...keys].filter((k) => writable.has(k));
      const primaryKey = catalog.primaryKeys.get(table) ?? [];
      if (primaryKey.some((c) => !columns.includes(c))) {
        failureCount += 1;
        entry.failed = rows.length;
        fail({ table, kind: 'missing-primary-key', message: `الصفوف لا تحوي أعمدة المفتاح الأساسي: ${primaryKey.join(', ')}` });
        continue;
      }
      if (!primaryKey.length) warnings.push(`الجدول ${table} بلا مفتاح أساسي: يُدخل دون ON CONFLICT`);

      const sql = buildInsertSql(table, columns, primaryKey);
      // a table that points at itself is loaded in one statement: constraints are checked at statement end
      const size = selfReferencing.has(table) ? rows.length : chunkSize;

      for (let from = 0; from < rows.length; from += size) {
        const chunk = rows.slice(from, from + size);
        const whole = await inSavepoint(client, 'restore_chunk', () => client.query(sql, [JSON.stringify(chunk)]));
        if (whole.ok) {
          entry.loaded += chunk.length;
          continue;
        }
        // find the offending rows one by one
        for (let i = 0; i < chunk.length; i += 1) {
          const single = await inSavepoint(client, 'restore_row', () => client.query(sql, [JSON.stringify([chunk[i]])]));
          if (single.ok) {
            entry.loaded += 1;
          } else {
            entry.failed += 1;
            failureCount += 1;
            fail({
              table,
              kind: 'row',
              row: from + i,
              key: Object.fromEntries(primaryKey.map((c) => [c, chunk[i][c]])),
              message: String(single.error?.message ?? single.error).split('\n')[0].slice(0, 300),
            });
          }
        }
      }
      log(`- ${table}: ${entry.loaded}/${rows.length}${entry.failed ? `  (${entry.failed} فشلت)` : ''}`);
    }

    // 5) triggers back on, sequences past the restored maximum
    for (const t of present) await client.query(`ALTER TABLE public.${quote(t)} ENABLE TRIGGER USER`);

    const sequences = (
      await client.query(
        `SELECT c.relname AS table_name, a.attname AS column_name,
                pg_get_serial_sequence(format('public.%I', c.relname), a.attname) AS seq
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
         JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
         WHERE c.relkind IN ('r', 'p') AND pg_get_serial_sequence(format('public.%I', c.relname), a.attname) IS NOT NULL`,
      )
    ).rows.filter((s) => present.includes(s.table_name));
    for (const s of sequences) {
      await client.query(
        `SELECT setval($1::regclass, COALESCE((SELECT MAX(${quote(s.column_name)}) FROM public.${quote(s.table_name)}), 0) + 1, false)`,
        [s.seq],
      );
    }

    // 6) what is in the database must equal what was loaded
    for (const entry of report) {
      const { rows } = await client.query(`SELECT count(*)::int AS n FROM public.${quote(entry.table)}`);
      if (rows[0].n !== entry.loaded) {
        failureCount += 1;
        fail({ table: entry.table, kind: 'count-mismatch', message: `في القاعدة ${rows[0].n} صفاً بينما المحمَّل ${entry.loaded}` });
      }
    }

    if (failureCount > 0 && !allowPartial) {
      throw new RestoreError(
        `فشلت الاستعادة (${failureCount} خطأ) وأُلغيت كلها دون تغيير القاعدة. راجع القائمة، أو مرّر allowPartial لاستعادة جزئية.`,
        { failures, failureCount, tables: report },
      );
    }

    if (dryRun) {
      await client.query('ROLLBACK');
    } else {
      await client.query('COMMIT');
    }
    return { committed: !dryRun, dryRun, order, tables: report, failures, failureCount, warnings };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (error instanceof RestoreError) {
      error.details = { failures, failureCount, tables: report, ...error.details };
    }
    throw error;
  }
}
