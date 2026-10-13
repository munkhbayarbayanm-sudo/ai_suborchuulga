import { type PrismaClient } from '@mongolsub/database';
import { AppError, AssetStatus, JobStatus, errorDiagnostics } from '@mongolsub/domain';
import type { Config } from '@mongolsub/config';
import { inspectMedia } from '@mongolsub/media';
import type { StorageProvider } from '@mongolsub/storage';
export async function processInspection(jobId: string, db: PrismaClient, storage: StorageProvider, config: Config): Promise<void> {
  const job = await db.processingJob.findUniqueOrThrow({ where: { id: jobId }, include: { mediaAsset: true } });
  if (job.status === JobStatus.COMPLETED || job.status === JobStatus.CANCELLED || job.status === JobStatus.FAILED) return;
  const asset = job.mediaAsset;
  if (!asset) throw new AppError('MEDIA_NOT_FOUND', 'The inspection has no media asset.');
  await db.$transaction([
    db.processingJob.update({ where: { id: jobId }, data: { status: JobStatus.PROCESSING, progress: 10, startedAt: job.startedAt ?? new Date(), completedAt: null, errorCode: null, errorMessage: null } }),
    db.mediaAsset.update({ where: { id: asset.id }, data: { status: AssetStatus.INSPECTING } })
  ]);
  console.info(JSON.stringify({ event: 'inspection_started', jobId, mediaAssetId: asset.id, episodeId: asset.episodeId }));
  try {
    const lease = await storage.materialize(asset.storageKey);
    let metadata;
    try { metadata = await inspectMedia(lease.path, config.FFPROBE_PATH, config.MEDIA_PROCESS_TIMEOUT_MS); }
    finally { await lease.release(); }
    await db.$transaction(async tx => {
      await tx.mediaStream.deleteMany({ where: { mediaAssetId: asset.id } });
      await tx.mediaStream.createMany({ data: metadata.streams.map(stream => ({ ...stream, mediaAssetId: asset.id })) });
      await tx.mediaAsset.update({ where: { id: asset.id }, data: { status: AssetStatus.READY, durationMs: metadata.durationMs, containerFormat: metadata.containerFormat, width: metadata.width, height: metadata.height } });
      await tx.processingJob.update({ where: { id: jobId }, data: { status: JobStatus.COMPLETED, progress: 100, completedAt: new Date() } });
    });
    console.info(JSON.stringify({ event: 'inspection_completed', jobId, mediaAssetId: asset.id, episodeId: asset.episodeId }));
  } catch (error) {
    const failure = error instanceof AppError ? error : new AppError('INSPECTION_FAILED', 'Media inspection failed. Check worker and storage readiness.');
    await failInspection(jobId, db, failure.code, failure.message);
    console.error(JSON.stringify({ event: 'inspection_failed', jobId, mediaAssetId: asset.id, episodeId: asset.episodeId, code: failure.code, diagnostics: { ...errorDiagnostics(error), ...failure.diagnostics } }));
    throw failure;
  }
}
export async function failInspection(jobId: string, db: PrismaClient, code: string, message: string): Promise<void> {
  await db.$transaction(async tx => {
    const job = await tx.processingJob.findUnique({ where: { id: jobId } });
    if (!job || job.status === JobStatus.COMPLETED || job.status === JobStatus.CANCELLED || job.status === JobStatus.FAILED) return;
    await tx.processingJob.update({ where: { id: jobId }, data: { status: JobStatus.FAILED, errorCode: code, errorMessage: message, completedAt: new Date() } });
    if (job.mediaAssetId) await tx.mediaAsset.update({ where: { id: job.mediaAssetId }, data: { status: AssetStatus.FAILED } });
  });
}
