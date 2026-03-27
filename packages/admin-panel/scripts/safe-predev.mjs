import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const lockPath = path.join(projectRoot, '.next', 'dev', 'lock');
const serverEntrypoint = path.join(projectRoot, 'src', 'server.ts');

function hasRunningAdminPanelProcess() {
  try {
    const output = execSync('ps -eo args', { encoding: 'utf8' });
    return output.split('\n').some((line) => line.includes(serverEntrypoint));
  } catch {
    return false;
  }
}

function killProcessOnPort8053() {
  try {
    const pidOutput = execSync('sudo fuser 8053/tcp 2>/dev/null || true', {
      encoding: 'utf8',
      shell: '/bin/bash',
    }).trim();

    if (!pidOutput) {
      console.log('[predev] No process is using port 8053.');
      return;
    }

    const pids = pidOutput
      .split(/\s+/)
      .map((value) => value.trim())
      .filter((value) => /^\d+$/.test(value));

    if (pids.length === 0) {
      console.log('[predev] Port 8053 check returned no PID.');
      return;
    }

    for (const pid of pids) {
      execSync(`sudo kill -9 ${pid}`, { stdio: 'inherit' });
      console.log(`[predev] Killed PID ${pid} on port 8053.`);
    }
  } catch (error) {
    console.warn('[predev] Failed to kill process on port 8053:', error.message);
  }
}

killProcessOnPort8053();

if (!fs.existsSync(lockPath)) {
  console.log('[predev] No lock file found.');
  process.exit(0);
}

if (hasRunningAdminPanelProcess()) {
  console.log('[predev] Active admin-panel dev process detected; keeping .next lock.');
  process.exit(0);
}

fs.rmSync(lockPath, { force: true });
console.log('[predev] Removed stale .next/dev/lock.');
