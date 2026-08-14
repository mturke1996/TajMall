import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  readFileSync(resolve(root, '.env.local'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')];
    }),
);

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});
const { data: row } = await admin
  .from('contacts')
  .select('id')
  .not('portal_token', 'is', null)
  .limit(1)
  .maybeSingle();
if (!row?.id) {
  const any = await admin.from('contacts').select('id').limit(1).maybeSingle();
  if (!any.data?.id) {
    console.log('SKIP: no contacts');
    process.exit(0);
  }
  const { data, error } = await admin.rpc('ensure_tenant_portal_token', {
    p_contact_id: any.data.id,
  });
  console.log(error ? `FAIL ${error.message}` : `PASS token len=${String(data).length}`);
  process.exit(error ? 1 : 0);
}
const { data, error } = await admin.rpc('ensure_tenant_portal_token', {
  p_contact_id: row.id,
});
console.log(error ? `FAIL ${error.message}` : `PASS token len=${String(data).length}`);
process.exit(error ? 1 : 0);
