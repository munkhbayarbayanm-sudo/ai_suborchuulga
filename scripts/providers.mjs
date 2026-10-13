import { spawn, execFile } from 'node:child_process';
import { resolve } from 'node:path';

const child = spawn('uv', [
  'run', '--directory', 'services/providers', '--locked', '--no-sync',
  'python', '-m', 'studio_providers'
], {
  stdio: ['pipe', 'inherit', 'inherit'], windowsHide: true,
  env: {
    ...process.env,
    STORAGE_ROOT: resolve(process.env.STORAGE_ROOT || './data/media'),
    MEDIA_WORK_ROOT: resolve(process.env.MEDIA_WORK_ROOT || './data/work'),
    PROVIDER_MODEL_ROOT: resolve(process.env.PROVIDER_MODEL_ROOT || './data/provider-models')
  }
});
let stopping = false;
child.once('error', () => {
  console.error('Provider runner could not start. Install uv and sync services/providers first.');
  process.exitCode = 1;
});
child.once('exit', code => {
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.stdin.pause();
  process.exitCode = stopping ? 0 : code ?? 1;
});
function stop() {
  if (stopping) return;
  stopping = true;
  if (process.platform === 'win32' && child.pid) {
    execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {});
  } else child.kill('SIGINT');
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdin.on('data', chunk => { if (chunk.includes(3)) stop(); else child.stdin.write(chunk); });
child.stdin.on('error', () => {});
