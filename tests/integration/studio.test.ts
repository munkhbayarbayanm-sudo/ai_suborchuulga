import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, connect, type Socket } from 'node:net';
import { once } from 'node:events';
import { Worker } from 'bullmq';
import { dispatchPending, INSPECTION_QUEUE, inspectionQueue, redisConnection } from '../../packages/queue/src/index';
import { PrismaClient } from '../../packages/database/src/index';
import { loadConfig } from '../../packages/config/src/index';
import { createApi } from '../../apps/api/src/app';
import { createInspectionWorker } from '../../apps/worker/src/worker';
import { createFixture } from '../../scripts/create-fixture';
import { episodeDetailSchema, importResultSchema, jobSchema, mediaDetailSchema, seriesDetailSchema, seriesSchema } from '../../packages/contracts/src/index';
describe('real API → PostgreSQL/storage → Redis/BullMQ → ffprobe', () => {
  const config = loadConfig();
  const db = new PrismaClient({ datasourceUrl: config.DATABASE_URL });
  let app: Awaited<ReturnType<typeof createApi>>; let worker: Awaited<ReturnType<typeof createInspectionWorker>>;
  let root: string; let url: string; let seriesId: string; let episodeId: string;
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'mongolsub-integration-'));
    app = await createApi({ ...config, STORAGE_ROOT: root, MAX_UPLOAD_BYTES: 2_000_000 });
    await app.listen(0, '127.0.0.1'); url = await app.getUrl();
    worker = await createInspectionWorker({ ...config, STORAGE_ROOT: root });
    await createFixture(join(root, 'fixture.mkv'), config.FFMPEG_PATH);
  });
  afterAll(async () => {
    if (worker) await worker.close(); if (app) await app.close();
    if (seriesId) await db.series.delete({ where: { id: seriesId } });
    await db.$disconnect(); if (root) await rm(root, { recursive: true, force: true });
  });
  async function json(path: string, method = 'GET', value?: unknown) {
    const response = await fetch(url + path, { method, ...(value === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }) });
    const body: unknown = await response.json(); return { response, body };
  }
  async function upload(bytes: Uint8Array, filename = 'episode.mkv') {
    const form = new FormData(); form.append('file', new Blob([new Uint8Array(bytes)], { type: 'video/x-matroska' }), filename);
    const response = await fetch(`${url}/episodes/${episodeId}/media`, { method: 'POST', body: form });
    return { response, body: await response.json() as unknown };
  }
  async function waitJob(id: string) {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      const job = jobSchema.parse((await json(`/jobs/${id}`)).body);
      if (job.status === 'COMPLETED' || job.status === 'FAILED') return job;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Job did not reach a terminal state');
  }
  it('validates requests and creates, reads and updates Series and Episode', async () => {
    expect((await json('/series', 'POST', { title: '' })).response.status).toBe(400);
    expect((await json('/series/bad-id')).response.status).toBe(400);
    expect((await json(`/series/${randomUUID()}`)).response.status).toBe(404);
    const result = await json('/series', 'POST', { title: 'Integration series', sourceLanguage: 'zh-TW' });
    expect(result.response.status).toBe(201); seriesId = seriesSchema.parse(result.body).id;
    const updated = seriesSchema.parse((await json(`/series/${seriesId}`, 'PATCH', { title: 'Updated series', sourceLanguage: 'en' })).body);
    expect(updated.title).toBe('Updated series'); expect(updated.sourceLanguage).toBe('en');
    expect((await json(`/series/${seriesId}/episodes`, 'POST', { title: 'Pilot' })).response.status).toBe(201);
    const details = seriesDetailSchema.parse((await json(`/series/${seriesId}`)).body);
    episodeId = details.episodes[0]?.id ?? ''; expect(episodeId).not.toBe('');
    expect((await json(`/episodes/${episodeId}`, 'PATCH', { episodeNumber: 1 })).response.status).toBe(200);
    expect(episodeDetailSchema.parse((await json(`/episodes/${episodeId}`)).body).episodeNumber).toBe(1);
  });
  it('persists video, completes asynchronous inspection and persists all streams', async () => {
    const uploaded = await upload(await readFile(join(root, 'fixture.mkv')), '../本片.mkv');
    expect(uploaded.response.status, JSON.stringify(uploaded.body)).toBe(201);
    const imported = importResultSchema.parse(uploaded.body);
    expect(imported.asset.originalFilename).toBe('本片.mkv'); expect(imported.job.status).toBe('QUEUED');
    const job = await waitJob(imported.job.id);
    expect(job.status).toBe('COMPLETED'); expect(job.progress).toBe(100);
    expect(job.startedAt).not.toBeNull(); expect(job.completedAt).not.toBeNull();
    const media = mediaDetailSchema.parse((await json(`/media/${imported.asset.id}`)).body);
    expect(media.status).toBe('READY'); expect(media.width).toBe(320); expect(media.height).toBe(180);
    expect(media.durationMs).toBeGreaterThanOrEqual(2000);
    expect(media.streams.map(s => s.type)).toEqual(['VIDEO', 'AUDIO', 'SUBTITLE']); expect(media.streams[2]?.language).toBe('eng');
    const persisted = await db.mediaAsset.findUniqueOrThrow({ where: { id: media.id } });
    expect(await readFile(join(root, persisted.storageKey))).toEqual(await readFile(join(root, 'fixture.mkv')));
    expect(JSON.stringify(media)).not.toContain('storageKey');
  });
  it('fails invalid media without breaking the application or retrying forever', async () => {
    const imported = importResultSchema.parse((await upload(new TextEncoder().encode('invalid video'))).body);
    const job = await waitJob(imported.job.id);
    expect(job.status).toBe('FAILED'); expect(job.errorCode).toBe('INVALID_MEDIA');
    expect(job.errorMessage).toContain('damaged or unsupported');
    expect(mediaDetailSchema.parse((await json(`/media/${imported.asset.id}`)).body).status).toBe('FAILED');
    expect((await json(`/episodes/${episodeId}`)).response.ok).toBe(true);
  });
  it('rejects empty, oversize, extra-file and non-multipart uploads', async () => {
    expect((await upload(new Uint8Array())).response.status).toBe(400);
    expect((await upload(new Uint8Array(2_000_001))).response.status).toBe(413);
    expect((await json(`/episodes/${episodeId}/media`, 'POST', {})).response.status).toBe(415);
    const form = new FormData(); form.append('file', new Blob(['data']), 'a.mp4'); form.append('file', new Blob(['data']), 'b.mp4');
    expect((await fetch(`${url}/episodes/${episodeId}/media`, { method: 'POST', body: form })).status).toBe(400);
  });
  it('reports runtime readiness', async () => {
    const { response, body } = await json('/health'); expect(response.status).toBe(200);
    expect(body).toMatchObject({ database: true, redis: true, tools: { ffprobe: true, ffmpeg: true }, worker: { ready: true } });
  });
  it('maps missing tools to a useful final job error', async () => {
    await worker.close();
    worker = await createInspectionWorker({ ...config, STORAGE_ROOT: root, FFPROBE_PATH: 'mongolsub-missing-probe' });
    const imported = importResultSchema.parse((await upload(await readFile(join(root, 'fixture.mkv')))).body);
    expect(await waitJob(imported.job.id)).toMatchObject({ status: 'FAILED', errorCode: 'MEDIA_TOOL_MISSING' });
  });
  it('does not return internal exceptions', async () => {
    const malformed = await fetch(url + '/series', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' });
    expect(malformed.status).toBe(400); expect(await malformed.json()).toMatchObject({ code: 'INVALID_REQUEST' });
  });
  it('reconciles a retained failed transport job into a persisted terminal failure', async () => {
    await worker.close();
    const redis = redisConnection(config.REDIS_URL); const queue = inspectionQueue(redis);
    const asset = await db.mediaAsset.create({ data: { episodeId, originalFilename: 'transport-test.mp4', storageKey: randomUUID(), mimeType: 'video/mp4', sizeBytes: 1n } });
    const row = await db.processingJob.create({ data: { episodeId, mediaAssetId: asset.id } });
    const transportWorker = new Worker(INSPECTION_QUEUE, async () => { throw new Error('Synthetic transport failure before database transition'); }, { connection: redis });
    try {
      await transportWorker.waitUntilReady(); const transport = await queue.add('INSPECT_MEDIA', { jobId: row.id }, { jobId: row.id });
      for (let count = 0; count < 100 && await transport.getState() !== 'failed'; count++) await new Promise(resolve => setTimeout(resolve, 50));
      expect(await transport.getState()).toBe('failed');
      expect((await db.processingJob.findUniqueOrThrow({ where: { id: row.id } })).status).toBe('QUEUED');
      await dispatchPending(db, queue);
      expect(await db.processingJob.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ status: 'FAILED', errorCode: 'QUEUE_DELIVERY_FAILED' });
      expect((await db.mediaAsset.findUniqueOrThrow({ where: { id: asset.id } })).status).toBe('FAILED');
    } finally { await transportWorker.close(); await queue.close(); redis.disconnect(); }
  });
  it('bounds worker shutdown after the Redis transport becomes unavailable', async () => {
    const target = new URL(config.REDIS_URL); const sockets = new Set<Socket>();
    const proxy = createServer(socket => {
      const upstream = connect({ host: target.hostname, port: Number(target.port) });
      sockets.add(socket); sockets.add(upstream);
      socket.on('error', () => {}); upstream.on('error', () => {});
      socket.pipe(upstream); upstream.pipe(socket);
    });
    proxy.listen(0, '127.0.0.1'); await once(proxy, 'listening');
    const address = proxy.address(); if (!address || typeof address === 'string') throw new Error('Proxy address unavailable');
    worker = await createInspectionWorker({ ...config, REDIS_URL: `redis://127.0.0.1:${address.port}`, STORAGE_ROOT: root });
    for (const socket of sockets) socket.destroy();
    await new Promise<void>(resolve => proxy.close(() => resolve()));
    await new Promise(resolve => setTimeout(resolve, 1100));
    const started = Date.now(); await worker.close();
    expect(Date.now() - started).toBeLessThan(10000);
  });
});
