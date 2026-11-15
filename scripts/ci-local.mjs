#!/usr/bin/env node
/**
 * Runs, on this computer, the same checks CI runs (read from .github/workflows/ci.yml, so the two never drift):
 *
 *   npm run ci:local                      # typecheck, lint, every verify:* and test:* check
 *   npm run ci:local -- --list            # only print what would run
 *   npm run ci:local -- --only cold       # only the checks whose command contains "cold"
 *   npm run ci:local -- --with-build      # also `next build` and the real-browser offline-shell check
 *   npm run ci:local -- --stop-on-fail
 *
 * It prints one line per check and the last lines of any failure. It changes no tracked file.
 * Differences from CI you should know about: CI starts the clock for the database suites at a fixed date
 * (libfaketime, Linux only), so on your computer those suites use today's date: see the execution guide, section 5.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const withBuild = flag('--with-build');

const BUILD_ONLY = /^npm run (build|e2e:offline-shell)$/;
const COMMAND = /^(npm run [\w:.-]+|node scripts\/[\w./-]+(?: --[\w-]+)*)$/;

/** The commands inside the `run:` lines of the CI workflow, in order, without the CI-only plumbing. */
export function commandsFromWorkflow(text) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/^run:\s*/, '').replace(/^t\s+/, '');
    if (COMMAND.test(line) && !out.includes(line)) out.push(line);
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1].replaceAll('\\', '/')}` || process.argv[1]?.endsWith('ci-local.mjs')) {
  const workflow = readFileSync(resolve('.github/workflows/ci.yml'), 'utf8');
  let commands = commandsFromWorkflow(workflow).filter((c) => withBuild || !BUILD_ONLY.test(c));
  if (only) commands = commands.filter((c) => c.includes(only));

  if (flag('--list')) {
    for (const c of commands) console.log(c);
    console.log(`\n${commands.length} checks`);
    process.exit(0);
  }
  if (!commands.length) {
    console.error('لا توجد فحوص مطابقة.');
    process.exit(1);
  }

  const buildEnv = {
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:9',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'placeholder-anon-key',
    NEXT_PUBLIC_APP_NAME: 'Fluxen',
    NEXT_PUBLIC_DEFAULT_LOCALE: 'ar',
    NEXT_PUBLIC_DEFAULT_CURRENCY: 'LYD',
    // the offline-shell check needs a browser: Edge ships with Windows, Chrome is usual elsewhere
    ...(process.env.PW_CHANNEL ? {} : { PW_CHANNEL: process.platform === 'win32' ? 'msedge' : 'chrome' }),
  };

  if (new Date() >= new Date('2027-01-01T00:00:00Z')) {
    console.log('تنبيه: بعد 1 يناير 2027 يفشل test:hardening و verify:rent-allocation بدون ساعة ثابتة (دَين مسجَّل N-16)؛ ليس تراجعاً.\n');
  }

  const failed = [];
  const started = Date.now();
  for (const command of commands) {
    const t0 = Date.now();
    const result = spawnSync(command, {
      shell: true,
      cwd: resolve('.'),
      encoding: 'utf8',
      timeout: 10 * 60 * 1000,
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, ...buildEnv },
    });
    const seconds = ((Date.now() - t0) / 1000).toFixed(1);
    const ok = result.status === 0;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${command}  (${seconds}s)`);
    if (!ok) {
      failed.push(command);
      const tail = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim().split('\n').slice(-14).join('\n');
      console.log(tail.replace(/^/gm, '      '));
      if (flag('--stop-on-fail')) break;
    }
  }
  console.log(`\n${commands.length - failed.length}/${commands.length} نجحت في ${((Date.now() - started) / 60000).toFixed(1)} دقيقة`);
  if (failed.length) console.log(`الفاشلة:\n  ${failed.join('\n  ')}`);
  process.exit(failed.length ? 1 : 0);
}
