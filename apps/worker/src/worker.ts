import { Worker } from 'bullmq';
import { PrismaClient } from '@mongolsub/database';
import type { Config } from '@mongolsub/config';
import { dispatchPending, inspectionPayload, inspectionQueue, INSPECTION_QUEUE, redisConnection, WORKER_HEARTBEAT } from '@mongolsub/queue';
import { LocalStorage } from '@mongolsub/storage';
import { processInspection, failInspection } from './inspection';
import { settleWithin } from './shutdown';
export async function createInspectionWorker(config: Config) {
  const db = new PrismaClient({ datasourceUrl: config.DATABASE_URL });
  await db.$connect();
  const redis = redisConnection(config.REDIS_URL);
  const queue = inspectionQueue(redis);
  const storage = new LocalStorage(config.STORAGE_ROOT);
  const worker = new Worker(INSPECTION_QUEUE, async job => {
    const { jobId } = inspectionPayload.parse(job.data);
    await processInspection(jobId, db, storage, config);
  }, { connection: redis, concurrency: config.WORKER_CONCURRENCY, maxStalledCount: 1 });
  worker.on('error', () => console.error(JSON.stringify({ event: 'worker_transport_error' })));
  worker.on('failed', (job, _error) => {
    const parsed = inspectionPayload.safeParse(job?.data);
    if (parsed.success) void failInspection(parsed.data.jobId, db, 'WORKER_FAILED', 'Inspection stopped unexpectedly. Check worker readiness.').catch(() => console.error(JSON.stringify({ event: 'failure_persistence_failed', jobId: parsed.data.jobId })));
  });
  await worker.waitUntilReady();
  let closing = false;
  let running: Promise<void> | undefined;
  const tick = () => {
    if (closing || running) return;
    running = (async () => {
      await dispatchPending(db, queue);
      await redis.set(WORKER_HEARTBEAT, new Date().toISOString(), 'EX', 15);
    })().catch(() => console.error(JSON.stringify({ event: 'dispatch_or_heartbeat_failed' }))).finally(() => { running = undefined; });
  };
  tick();
  const timer = setInterval(tick, 1000);
  if (running) await running;
  return { worker, db, queue, async close() {
    if (closing) return;
    closing = true; clearInterval(timer);
    const dispatchSettled = await settleWithin(running ?? Promise.resolve(), 2500);
    if (!dispatchSettled) redis.disconnect();
    const workerSettled = await settleWithin(worker.close(!dispatchSettled), config.MEDIA_PROCESS_TIMEOUT_MS + 5000);
    if (!workerSettled) { console.error(JSON.stringify({ event: 'worker_shutdown_timeout' })); await settleWithin(worker.disconnect(), 1000); }
    await settleWithin(queue.close(), 2500);
    if (redis.status === 'ready') await settleWithin(redis.del(WORKER_HEARTBEAT), 1000);
    redis.disconnect(); await db.$disconnect();
  } };
}
