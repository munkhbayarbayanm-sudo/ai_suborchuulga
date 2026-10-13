import { spawn, execFile } from 'node:child_process';
import { resolve } from 'node:path';
// Turbo runs each app in its own working directory. Share one absolute storage root.
const child = spawn(process.execPath, [resolve('node_modules/turbo/bin/turbo'), 'run', 'dev'], {
  stdio: ['pipe', 'inherit', 'inherit'], windowsHide: true,
  env: { ...process.env, STORAGE_ROOT: resolve(process.env.STORAGE_ROOT || './data/media') }
});
child.once('error', () => { console.error('Development runner could not start. Run pnpm install.'); process.exitCode = 1; });
child.once('exit', code => { if (process.stdin.isTTY) process.stdin.setRawMode(false); process.stdin.pause(); process.exitCode = stopping ? 0 : code ?? 0; });
let stopping = false;
function stop() {
  if (stopping) return; stopping = true;
  // Windows command shims do not reliably forward Ctrl+C through Turbo's tree.
  // Target only the child tree started by this runner, never all Node processes.
  if (process.platform === 'win32' && child.pid) execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {});
  else child.kill('SIGINT');
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
// Own terminal input so Windows CTRL+C cannot get trapped in a nested cmd shim.
if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdin.on('data', chunk => { if (chunk.includes(3)) stop(); else child.stdin.write(chunk); });
child.stdin.on('error', () => {});
