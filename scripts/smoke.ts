import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { seriesSchema, episodeSchema, importResultSchema, jobSchema, mediaDetailSchema, healthSchema } from '../packages/contracts/src/index';
const base = `http://127.0.0.1:${process.env.API_PORT ?? '4000'}`;
async function json(path: string, value?: unknown): Promise<unknown> {
  const response = await fetch(base + path, value === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  const body: unknown = await response.json();
  if (!response.ok) throw new Error(`Runtime smoke request failed with status ${response.status}`);
  return body;
}
const health = healthSchema.parse(await json('/health'));
if (health.status !== 'ok') throw new Error('Runtime smoke requires all services ready.');
const series = seriesSchema.parse(await json('/series', { title: 'Foundation verification', sourceLanguage: 'en', description: 'Synthetic runtime verification; no copyrighted media.' }));
const episode = episodeSchema.parse(await json(`/series/${series.id}/episodes`, { title: 'Synthetic inspection', episodeNumber: 1 }));
async function importVideo(bytes: Uint8Array, filename: string) {
  const form = new FormData(); form.append('file', new Blob([new Uint8Array(bytes)], { type: 'video/x-matroska' }), filename);
  const response = await fetch(`${base}/episodes/${episode.id}/media`, { method: 'POST', body: form });
  if (!response.ok) throw new Error(`Runtime smoke import failed: ${response.status}`);
  const result = importResultSchema.parse(await response.json());
  for (let count = 0; count < 100; count++) {
    const job = jobSchema.parse(await json(`/jobs/${result.job.id}`));
    if (job.status === 'COMPLETED' || job.status === 'FAILED') return { assetId: result.asset.id, job };
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('Runtime smoke inspection did not finish.');
}
const success = await importVideo(await readFile(resolve('data/fixtures/synthetic.mkv')), 'synthetic.mkv');
const media = mediaDetailSchema.parse(await json(`/media/${success.assetId}`));
if (success.job.status !== 'COMPLETED' || media.status !== 'READY' || media.width !== 320 || media.height !== 180 || media.streams.length !== 3) throw new Error('Runtime smoke metadata assertion failed.');
const failure = await importVideo(new TextEncoder().encode('Synthetic invalid video'), 'invalid.mkv');
if (failure.job.status !== 'FAILED' || failure.job.errorCode !== 'INVALID_MEDIA') throw new Error('Runtime smoke failure assertion failed.');
const result = { seriesId: series.id, episodeId: episode.id, completedJob: success.job.id, failedJob: failure.job.id, streamTypes: media.streams.map(s => s.type), resolution: [media.width, media.height], durationMs: media.durationMs };
await mkdir(resolve('data'), { recursive: true });
await writeFile(resolve('data/runtime-smoke.json'), JSON.stringify(result, null, 2));
console.info(JSON.stringify({ event: 'runtime_smoke_passed', ...result }));
