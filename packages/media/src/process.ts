import { spawn } from 'node:child_process';
import { AppError, errorDiagnostics } from '@mongolsub/domain';
import { createHash } from 'node:crypto';
import { parseProbe, type Inspection } from './parser';
export interface ProcessResult { stdout: string; stderr: string; exitCode: number | null }
export function runProcess(executable: string, args: readonly string[], timeoutMs: number, maxOutputBytes = 4 * 1024 * 1024, signal?:AbortSignal): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    if(signal?.aborted) { reject(new AppError('CANCELLED','Media processing was cancelled.')); return; }
    const child = spawn(executable, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout: Buffer[] = []; const stderr: Buffer[] = [];
    let total = 0; let failure: AppError | undefined;
    const abort=()=>{failure=new AppError('CANCELLED','Media processing was cancelled.');child.kill('SIGKILL');};
    signal?.addEventListener('abort',abort,{once:true});
    const timeout = setTimeout(() => { failure = new AppError('MEDIA_TIMEOUT', 'Media inspection timed out. Try a smaller or repaired file.', 400, { timeoutMs }); child.kill('SIGKILL'); }, timeoutMs);
    function collect(target: Buffer[], chunk: Buffer) {
      total += chunk.length;
      if (total > maxOutputBytes) { failure = new AppError('MEDIA_OUTPUT_LIMIT', 'The media tool exceeded its output limit.', 400, { maxOutputBytes }); child.kill('SIGKILL'); }
      else target.push(chunk);
    }
    child.stdout.on('data', (chunk: Buffer) => collect(stdout, chunk));
    child.stderr.on('data', (chunk: Buffer) => collect(stderr, chunk));
    child.on('error', error => { clearTimeout(timeout); signal?.removeEventListener('abort',abort); reject(new AppError('MEDIA_TOOL_MISSING', 'Media tool could not start. Check FFPROBE_PATH / FFMPEG_PATH and installation.', 400, errorDiagnostics(error))); });
    child.on('close', exitCode => { clearTimeout(timeout); signal?.removeEventListener('abort',abort); if (failure) reject(failure); else resolve({ stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8'), exitCode }); });
  });
}
export async function toolAvailable(executable: string): Promise<boolean> {
  try { return (await runProcess(executable, ['-version'], 3000, 64000)).exitCode === 0; } catch { return false; }
}
export async function inspectMedia(path: string, executable: string, timeoutMs: number): Promise<Inspection> {
  const result = await runProcess(executable, ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', '-i', path], timeoutMs);
  if (result.exitCode !== 0) throw new AppError('INVALID_MEDIA', 'This file could not be inspected. It may be damaged or unsupported.', 400, { toolExitCode: result.exitCode, stderrBytes: Buffer.byteLength(result.stderr), stderrDigest: createHash('sha256').update(result.stderr).digest('hex') });
  let raw: unknown;
  try { raw = JSON.parse(result.stdout); } catch { throw new AppError('INVALID_PROBE_OUTPUT', 'The media tool returned unreadable metadata.'); }
  const metadata = parseProbe(raw);
  if (!metadata.streams.some(s => s.type === 'VIDEO')) throw new AppError('NO_VIDEO_STREAM', 'The imported file does not contain a video stream.');
  return metadata;
}
