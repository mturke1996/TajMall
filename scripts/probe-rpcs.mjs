import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  readFileSync(resolve(root, '.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')];
    }),
);

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

const checks = [
  ['get_journal_entries_for_period', { p_start_date: '2026-01-01', p_end_date: '2026-01-31', p_status: 'POSTED' }],
  ['close_fiscal_year', {}],
  ['ensure_tenant_portal_token', { p_tenant_id: '00000000-0000-0000-0000-000000000000' }],
];

for (const [name, args] of checks) {
  const { error } = await sb.rpc(name, args);
  const missing =
    error &&
    (error.message.includes('Could not find') || error.message.includes('does not exist'));
  console.log(`${missing ? 'MISSING' : 'OK'} ${name}${error ? ` -> ${error.message.slice(0, 120)}` : ''}`);
}
