/**
 * إعادة تعيين كلمة مرور مستخدم (طوارئ — بدون كلمة المرور القديمة)
 * Usage: node scripts/reset-user-password.mjs user@email.com NewPassword123
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

function loadEnv(file) {
  const txt = fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');
  const out = {};
  for (const line of txt.split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\n]*)?"?\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const email = process.argv[2]?.trim().toLowerCase();
const password = process.argv[3];

if (!email || !password) {
  console.error('Usage: node scripts/reset-user-password.mjs <email> <new-password>');
  process.exit(1);
}
if (password.length < 6) {
  console.error('Password must be at least 6 characters.');
  process.exit(1);
}

const env = loadEnv('.env.local');
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local');
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (listErr) {
  console.error('listUsers failed:', listErr.message);
  process.exit(1);
}

const user = list.users.find((u) => u.email?.toLowerCase() === email);
if (!user) {
  console.error(`No auth user found for: ${email}`);
  process.exit(1);
}

const { error: updateErr } = await admin.auth.admin.updateUserById(user.id, { password });
if (updateErr) {
  console.error('updateUserById failed:', updateErr.message);
  process.exit(1);
}

console.log(`✓ Password updated for ${email} (${user.id})`);
