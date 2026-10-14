import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { z } from 'zod';
import { type PrismaClient } from '@mongolsub/database';
import { AssetStatus, JobStatus, JobType } from '@mongolsub/domain';
export const INSPECTION_QUEUE = 'mongolsub-media-inspection';
export const WORKER_HEARTBEAT = 'mongolsub:worker:heartbeat';
export const inspectionPayload = z.object({ jobId: z.string().uuid() }).strict();
export function redisConnection(url: string): Redis {
  const redis = new Redis(url, { maxRetriesPerRequest: null, connectTimeout: 3000, retryStrategy: times => Math.min(times * 200, 2000) });
  redis.on('error', () => {});
  return redis;
}
export function inspectionQueue(redis: Redis): Queue<{ jobId: string }> {
  return new Queue(INSPECTION_QUEUE, { connection: redis, defaultJobOptions: { attempts: 1, removeOnComplete: { age: 86400 }, removeOnFail: { age: 604800 } } });
}
// PostgreSQL is the durable enqueue source; UUID queue IDs deduplicate dispatch.
export async function dispatchPending(db: PrismaClient, queue: Queue<{jobId:string}>): Promise<number> {
  const pending = await db.processingJob.findMany({ where: { status: { in: [JobStatus.QUEUED, JobStatus.PROCESSING] } }, orderBy: { createdAt: 'asc' }, take: 100 });
  for (const job of pending) {
    const transport = await queue.getJob(job.id);
    if (transport && await transport.getState() === 'failed') {
      // A database outage may have prevented the failed-event handler from saving
      // the terminal state. Reconcile it after recovery, never re-run fatal media.
      await db.$transaction(async tx => {
        const result = await tx.processingJob.updateMany({ where: { id: job.id, status: { in: [JobStatus.QUEUED, JobStatus.PROCESSING] } }, data: { status: JobStatus.FAILED, completedAt: new Date(), errorCode: 'QUEUE_DELIVERY_FAILED', errorMessage: 'Background processing stopped before its result could be saved. Check database and worker readiness, then retry the operation.' } });
        if (result.count && job.mediaAssetId && job.jobType===JobType.INSPECT_MEDIA) await tx.mediaAsset.update({ where: { id: job.mediaAssetId }, data: { status: AssetStatus.FAILED } });
        if(result.count && job.jobType===JobType.FUSE_TRANSCRIPT)await tx.fusionRun.updateMany({where:{processingJobId:job.id,status:{in:[JobStatus.QUEUED,JobStatus.PROCESSING]}},data:{status:JobStatus.FAILED,stage:'Failed',completedAt:new Date()}});
        else if(result.count && job.jobType===JobType.LOCALIZE_TRANSCRIPT)await tx.localizationRun.updateMany({where:{processingJobId:job.id,status:{in:[JobStatus.QUEUED,JobStatus.PROCESSING]}},data:{status:JobStatus.FAILED,stage:'Failed',completedAt:new Date()}});
        else if(result.count && (job.jobType===JobType.GENERATE_EDITOR_PROXY||job.jobType===JobType.GENERATE_WAVEFORM))await tx.editorMediaPreparation.updateMany({where:{processingJobId:job.id,status:{in:[JobStatus.QUEUED,JobStatus.PROCESSING]}},data:{status:JobStatus.FAILED,stage:'Failed',completedAt:new Date()}});
        else if(result.count && (job.jobType===JobType.RUN_SUBTITLE_QC||job.jobType===JobType.RUN_SERIES_QC))await tx.qCRun.updateMany({where:{processingJobId:job.id,status:{in:['QUEUED','PROCESSING']}},data:{status:'FAILED',stage:'Failed',completedAt:new Date()}});
        else if(result.count && job.jobType!==JobType.INSPECT_MEDIA)await tx.sourceExtractionRun.updateMany({where:{processingJobId:job.id,status:{in:[JobStatus.QUEUED,JobStatus.PROCESSING]}},data:{status:JobStatus.FAILED,stage:'Failed',completedAt:new Date()}});
      });
    } else if (job.status === JobStatus.QUEUED) await queue.add(job.jobType, { jobId: job.id }, { jobId: job.id });
  }
  return pending.length;
}
