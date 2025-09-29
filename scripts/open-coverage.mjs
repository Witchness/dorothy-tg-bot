#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

function openFile(file) {
  try {
    if (process.platform === 'win32') {
      // Use PowerShell to open in default browser
      const ps = spawn('powershell', ['-NoProfile', '-Command', `Start-Process "${file}"`], {
        stdio: 'ignore',
        shell: false,
        detached: true,
      });
      ps.unref();
      return true;
    }
    // macOS
    if (process.platform === 'darwin') {
      const p = spawn('open', [file], { stdio: 'ignore', detached: true });
      p.unref();
      return true;
    }
    // Linux and others
    const p = spawn('xdg-open', [file], { stdio: 'ignore', detached: true });
    p.unref();
    return true;
  } catch {
    return false;
  }
}

const candidates = [
  resolve(process.cwd(), 'tests', 'coverage', 'index.html'),
  resolve(process.cwd(), 'tests', 'coverage', 'lcov-report', 'index.html'),
];

for (const f of candidates) {
  if (existsSync(f)) {
    const ok = openFile(f);
    if (!ok) {
      // non-fatal
      process.exit(0);
    }
    process.exit(0);
  }
}
// No report found — exit silently
process.exit(0);
