/**
 * تطبيق الهجرات الناقصة على قاعدة Fluxen البعيدة
 * التشغيل: node scripts/apply-missing-migrations.mjs
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, "..");

const env = Object.fromEntries(
  readFileSync(resolve(root, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [
        l.slice(0, i).trim(),
        l.slice(i + 1).trim().replace(/^"|"$/g, ""),
      ];
    }),
);

const dbUrl = (env.DATABASE_URL || "").replace("?pgbouncer=true", "");
if (!dbUrl) {
  console.error("Missing DATABASE_URL");
  process.exit(1);
}

const files = [
  "008_transaction_form_drafts.sql",
  "025_mark_tenant_rent_months_paid.sql",
  "058_documents_correspondence_receipts.sql",
];

/** جزء من 026: غلاف التوافق فقط (بدون GRANT الغامض) */
const compat026 = `
CREATE OR REPLACE FUNCTION public.mark_tenant_rent_months_paid(
  p_tenant_id uuid,
  p_months text[]
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.set_tenant_rent_month_status(p_tenant_id, p_months, true);
$$;
`;

const client = new pg.Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
console.log("Connected to Fluxen DB");

for (const file of files) {
  const path = resolve(root, "supabase/migrations", file);
  const sql = readFileSync(path, "utf8");
  console.log(`\n>>> Applying ${file} (${sql.length} bytes)…`);
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    console.log(`✓ ${file} applied`);
  } catch (e) {
    await client.query("ROLLBACK");
    // Idempotent re-runs: ignore "already exists" style only if we can verify later
    console.error(`✗ ${file} FAILED:`, e.message);
    await client.end();
    process.exit(1);
  }
}

console.log("\n>>> Applying 026 compat wrapper (mark_tenant_rent_months_paid)…");
try {
  await client.query("BEGIN");
  await client.query(compat026);
  await client.query("COMMIT");
  console.log("✓ 026 compat wrapper applied");
} catch (e) {
  await client.query("ROLLBACK");
  console.error("✗ 026 compat FAILED:", e.message);
  await client.end();
  process.exit(1);
}

// Expose new tables to Data API roles (match project pattern)
console.log("\n>>> GRANT tables to authenticated…");
await client.query(`
  GRANT ALL ON public.transaction_form_drafts TO authenticated;
  GRANT ALL ON public.correspondence_letters TO authenticated;
  GRANT ALL ON public.receipt_vouchers TO authenticated;
  GRANT ALL ON public.receipt_voucher_lines TO authenticated;
`);
console.log("✓ GRANTs applied");

try {
  await client.query(`NOTIFY pgrst, 'reload schema'`);
  console.log("✓ Notified PostgREST to reload schema");
} catch (e) {
  console.log("(schema reload notify skipped:", e.message + ")");
}

const { rows: tables } = await client.query(`
  SELECT tablename FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename IN (
      'transaction_form_drafts',
      'correspondence_letters',
      'receipt_vouchers',
      'receipt_voucher_lines'
    )
  ORDER BY 1
`);

const { rows: funcs } = await client.query(`
  SELECT p.proname AS name,
         pg_get_function_identity_arguments(p.oid) AS args
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'mark_tenant_rent_months_paid',
      'set_tenant_rent_month_status'
    )
  ORDER BY 1, 2
`);

console.log("\n=== Verified tables ===");
tables.forEach((r) => console.log(`  ✓ ${r.tablename}`));

console.log("\n=== Verified functions ===");
funcs.forEach((r) => console.log(`  ✓ ${r.name}(${r.args})`));

const neededTables = [
  "transaction_form_drafts",
  "correspondence_letters",
  "receipt_vouchers",
  "receipt_voucher_lines",
];
const presentTables = new Set(tables.map((r) => r.tablename));
const missingTables = neededTables.filter((t) => !presentTables.has(t));
const presentFuncs = new Set(funcs.map((r) => r.name));
const missingFuncs = [
  "mark_tenant_rent_months_paid",
  "set_tenant_rent_month_status",
].filter((n) => !presentFuncs.has(n));

await client.end();

if (missingTables.length || missingFuncs.length) {
  console.error("\nStill missing tables:", missingTables.join(", ") || "-");
  console.error("Still missing funcs:", missingFuncs.join(", ") || "-");
  process.exit(1);
}

console.log("\n✓ Missing migrations applied and verified");
