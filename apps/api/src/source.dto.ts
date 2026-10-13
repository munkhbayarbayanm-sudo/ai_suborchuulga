import type { Prisma } from '@mongolsub/database';
import { extractionRunSchema, sourceSegmentSchema, type ExtractionRunDto } from '@mongolsub/contracts';
import { toJob } from './dto';
export type RunRecord = Prisma.SourceExtractionRunGetPayload<{include:{processingJob:true,_count:{select:{segments:true}}}}>;
export function toRun(run:RunRecord):ExtractionRunDto {
  return extractionRunSchema.parse({id:run.id,episodeId:run.episodeId,mediaAssetId:run.mediaAssetId,method:run.method,provider:run.provider,providerVersion:run.providerVersion,modelVersion:run.modelVersion,streamIndex:run.streamIndex,languageRequested:run.languageRequested,languageDetected:run.languageDetected,revision:run.revision,status:run.status,settings:run.settings,processingJobId:run.processingJobId,job:toJob(run.processingJob),segmentCount:run._count.segments,stage:run.stage,processingDurationMs:run.processingDurationMs,device:run.device,startedAt:run.startedAt?.toISOString()??null,completedAt:run.completedAt?.toISOString()??null,createdAt:run.createdAt.toISOString(),updatedAt:run.updatedAt.toISOString()});
}
export function toSourceSegment(segment:Prisma.SourceSegmentGetPayload<Record<string,never>>,run:RunRecord) {
  return sourceSegmentSchema.parse({...segment,method:run.method,streamIndex:run.streamIndex,createdAt:segment.createdAt.toISOString()});
}
