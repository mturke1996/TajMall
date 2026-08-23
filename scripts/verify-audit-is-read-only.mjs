import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./audit-supabase-remote.mjs', import.meta.url), 'utf8');

assert.match(source, /BEGIN READ ONLY/i, 'remote audit must run inside a read-only transaction');
assert.doesNotMatch(source, /\.rpc\s*\(/, 'remote audit must not invoke database RPCs with possible side effects');
assert.doesNotMatch(source, /INSERT\s+INTO|UPDATE\s+public\.|DELETE\s+FROM|TRUNCATE\s+/i, 'remote audit must not contain write statements');

console.log('PASS: remote rent audit is read-only and invokes no RPCs');
