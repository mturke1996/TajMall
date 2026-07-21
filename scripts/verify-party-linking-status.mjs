/**
 * تحقق حالة هجرة 060 وربط الموردين/العملاء في قاعدة البيانات.
 * التشغيل: node scripts/verify-party-linking-status.mjs
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, '..');
const env = Object.fromEntries(
  readFileSync(resolve(root, '.env.local'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')];
    }),
);

const dbUrl = (env.DATABASE_URL || '').replace('?pgbouncer=true', '');
if (!dbUrl) {
  console.error('Missing DATABASE_URL');
  process.exit(1);
}

const client = new pg.Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
});

await client.connect();

const col = await client.query(`
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'disbursement_vouchers'
    AND column_name = 'contact_id'
`);

const idx = await client.query(`
  SELECT indexname
  FROM pg_indexes
  WHERE tablename = 'disbursement_vouchers'
    AND indexname = 'idx_disbursement_vouchers_contact'
`);

const fk = await client.query(`
  SELECT tc.constraint_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
   AND tc.table_schema = kcu.table_schema
  WHERE tc.table_schema = 'public'
    AND tc.table_name = 'disbursement_vouchers'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'contact_id'
`);

const kinds = await client.query(`
  SELECT kind, count(*)::int AS n
  FROM contacts
  GROUP BY kind
  ORDER BY kind
`);

const txLinked = await client.query(`
  SELECT c.kind, count(*)::int AS n
  FROM transactions t
  JOIN contacts c ON c.id = t.contact_id
  GROUP BY c.kind
  ORDER BY c.kind
`);

const vouchers = await client.query(`
  SELECT
    count(*)::int AS total,
    count(contact_id)::int AS with_contact
  FROM disbursement_vouchers
`);

const salaryCats = await client.query(`
  SELECT code, name_ar, active
  FROM categories
  WHERE code IN ('EXP-SAL', 'EXP-SLR')
  ORDER BY code
`);

const txHasContactCol = await client.query(`
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'transactions'
    AND column_name = 'contact_id'
`);

const jlHasContactCol = await client.query(`
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'journal_lines'
    AND column_name = 'contact_id'
`);

const ok =
  col.rows.length === 1 &&
  idx.rows.length === 1 &&
  fk.rows.length >= 1 &&
  txHasContactCol.rows.length === 1 &&
  jlHasContactCol.rows.length === 1;

console.log(
  JSON.stringify(
    {
      migration_060: {
        contact_id_column: col.rows[0] ?? null,
        index_present: idx.rows.length > 0,
        foreign_key: fk.rows[0]?.constraint_name ?? null,
      },
      existing_links: {
        transactions_contact_id: txHasContactCol.rows.length > 0,
        journal_lines_contact_id: jlHasContactCol.rows.length > 0,
      },
      data: {
        contacts_by_kind: kinds.rows,
        transactions_linked_by_kind: txLinked.rows,
        vouchers: vouchers.rows[0],
        salary_categories: salaryCats.rows,
      },
      status: ok ? 'OK' : 'INCOMPLETE',
    },
    null,
    2,
  ),
);

await client.end();
process.exit(ok ? 0 : 1);
