import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

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

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const secret = env.SUPABASE_SECRET_KEY;
const sb = createClient(url, anon, { auth: { persistSession: false } });

const a = await sb.from('contacts').select('id, name').limit(1);
console.log('anon select id,name:', a.error?.message ?? `ok rows=${a.data?.length}`);

const b = await sb.from('contacts').select('id, portal_token').limit(1);
console.log('anon select portal_token:', b.error?.message ?? `LEAK rows=${JSON.stringify(b.data)}`);

const admin = createClient(url, secret, { auth: { persistSession: false } });
const c = await admin.from('contacts').select('id, portal_token').not('portal_token', 'is', null).limit(1);
console.log(
  'service_role select portal_token:',
  c.error?.message ?? `ok hasToken=${!!c.data?.[0]?.portal_token}`,
);

// Authenticated user via password? skip — use RPC ensure still works for admin
const d = await admin.rpc('ensure_tenant_portal_token', {
  p_tenant_id: c.data?.[0]?.id,
});
console.log('ensure_tenant_portal_token:', d.error?.message ?? 'ok/skip');
