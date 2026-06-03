/**
 * تحرير منفذ محلي (مثلاً 3000 قبل npm run dev)
 * node scripts/free-port.mjs 3000
 */
import { execSync } from 'child_process';

const port = Number(process.argv[2] || 3000);
if (!Number.isFinite(port) || port < 1 || port > 65535) {
  console.error('Usage: node scripts/free-port.mjs [port]');
  process.exit(1);
}

function killWindows(p) {
  try {
    const out = execSync(`netstat -ano | findstr :${p}`, { encoding: 'utf8' });
    const pids = new Set();
    for (const line of out.split('\n')) {
      const m = line.trim().match(/\s+(\d+)\s*$/);
      if (m) pids.add(m[1]);
    }
    for (const pid of pids) {
      if (pid === '0') continue;
      try {
        execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
        console.log(`Stopped PID ${pid} on port ${p}`);
      } catch {
        /* already gone */
      }
    }
    if (pids.size === 0) console.log(`Port ${p} is free`);
  } catch {
    console.log(`Port ${p} is free`);
  }
}

function killUnix(p) {
  try {
    const pid = execSync(`lsof -ti tcp:${p}`, { encoding: 'utf8' }).trim();
    if (!pid) {
      console.log(`Port ${p} is free`);
      return;
    }
    for (const id of pid.split('\n').filter(Boolean)) {
      execSync(`kill -9 ${id}`);
      console.log(`Stopped PID ${id} on port ${p}`);
    }
  } catch {
    console.log(`Port ${p} is free`);
  }
}

if (process.platform === 'win32') killWindows(port);
else killUnix(port);
