import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(resolve(__dir, '../.env.local'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')];
    }),
);

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

const { data, error } = await sb.rpc('tenant_rent_summary_for_month', {
  p_month_key: '2026-01',
});
if (error) throw error;

const by = {};
for (const r of data) {
  by[r.current_month_status] = (by[r.current_month_status] || 0) + 1;
}
console.log('status counts Jan 2026:', by);

const exempt = data.filter((r) => r.current_month_status === 'exempt');
console.log(
  'exempt sample:',
  exempt.slice(0, 8).map((r) => ({
    name: r.name,
    amount: r.current_month_amount,
    paid: r.current_month_paid,
  })),
);

const unpaidWithZeroRent = data.filter(
  (r) =>
    r.current_month_status === 'unpaid' &&
    Number(r.current_month_amount) === 0,
);
console.log('unpaid with amount 0 (should be 0):', unpaidWithZeroRent.length);
