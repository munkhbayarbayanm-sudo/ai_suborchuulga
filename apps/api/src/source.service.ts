import { Prisma, type PrismaClient } from '@mongolsub/database';
import { AppError, ExtractionMethod, JobStatus, JobType } from '@mongolsub/domain';
import { asrRequestSchema, embeddedRequestSchema, idSchema, ocrRequestSchema, paginationSchema, runSettingsSchema, type ProviderReadiness, type RunSettings } from '@mongolsub/contracts';
import { extractionIdentity, textSubtitleSupported, embeddedReadiness, type ProviderSet } from '@mongolsub/extraction';
import type { Config } from '@mongolsub/config';
import { toRun, toSourceSegment } from './source.dto';
const include={processingJob:true,_count:{select:{segments:true}}} as const;
export class SourceService {
  constructor(private readonly db:PrismaClient,private readonly providers:ProviderSet,private readonly config:Config) {}
  async readiness() {
    const [embedded,asr,ocr]=await Promise.all([embeddedReadiness(this.config.FFMPEG_PATH),this.providers.asr.readiness(),this.providers.ocr.readiness()]);
    return {embedded,asr,ocr};
  }
  async create(episodeId:string,method: 'EMBEDDED_SUBTITLE'|'ASR'|'OCR',input:unknown) {
    const episode=idSchema.parse(episodeId);
    const request=method==='EMBEDDED_SUBTITLE'?embeddedRequestSchema.parse(input):method==='ASR'?asrRequestSchema.parse(input):ocrRequestSchema.parse(input);
    const asset=await this.db.mediaAsset.findUnique({where:{id:request.mediaAssetId},include:{streams:true}});
    if(!asset||asset.episodeId!==episode) throw new AppError('MEDIA_NOT_FOUND','The selected media does not belong to this episode.',404);
    if(asset.status!=='READY') throw new AppError('MEDIA_NOT_READY','Wait for media inspection to complete.',409);
    const streamIndex='streamIndex' in request?request.streamIndex:null;
    const stream=streamIndex===null?null:asset.streams.find(s=>s.streamIndex===streamIndex);
    let settings:RunSettings; let readiness:ProviderReadiness;
    if(method===ExtractionMethod.EMBEDDED_SUBTITLE) {
      if(!stream||stream.type!=='SUBTITLE') throw new AppError('SUBTITLE_STREAM_NOT_FOUND','Select a subtitle stream.');
      if(!textSubtitleSupported(stream.codec)) throw new AppError('IMAGE_BASED_STREAM_UNSUPPORTED','This subtitle codec is not supported for text extraction in Phase02.',422);
      const parsed=embeddedRequestSchema.parse(input);
      settings=runSettingsSchema.parse({method,streamIndex:parsed.streamIndex,language:parsed.language??null});
      readiness=await embeddedReadiness(this.config.FFMPEG_PATH);
    } else if(method===ExtractionMethod.ASR) {
      if(!stream||stream.type!=='AUDIO') throw new AppError('AUDIO_STREAM_NOT_FOUND','Select an audio stream.');
      const parsed=asrRequestSchema.parse(input);
      settings=runSettingsSchema.parse({method,streamIndex:parsed.streamIndex,language:parsed.language,align:parsed.align,diarize:parsed.diarize});
      readiness=await this.providers.asr.readiness();
    } else {
      if(!asset.durationMs||!asset.streams.some(s=>s.type==='VIDEO')) throw new AppError('INVALID_MEDIA','OCR requires inspected video with known duration.');
      const parsed=ocrRequestSchema.parse(input);
      if(Math.ceil(asset.durationMs/1000*parsed.fps)>this.config.OCR_MAX_FRAMES) throw new AppError('FRAME_LIMIT_EXCEEDED','Reduce OCR sampling rate for this source.');
      settings=runSettingsSchema.parse({method,language:parsed.language,fps:parsed.fps,region:parsed.region,bottomFraction:parsed.bottomFraction,minimumConfidence:parsed.minimumConfidence});
      readiness=await this.providers.ocr.readiness();
    }
    const revision=request.rerunKey??'default';
    const identityHash=extractionIdentity(asset.id,settings,readiness.provider,readiness.version,readiness.model,revision);
    const existing=await this.db.sourceExtractionRun.findUnique({where:{identityHash},include});
    if(existing) return toRun(existing);
    if(readiness.state==='UNAVAILABLE') throw new AppError('DEPENDENCY_UNAVAILABLE',method==='EMBEDDED_SUBTITLE'?'FFmpeg is unavailable.':'The selected source provider is unavailable. Embedded subtitle extraction remains available.',503);
    const jobType=method==='EMBEDDED_SUBTITLE'?JobType.EXTRACT_EMBEDDED_SUBTITLE:method==='ASR'?JobType.TRANSCRIBE_AUDIO:JobType.OCR_BURNED_SUBTITLE;
    try {
      const run=await this.db.$transaction(async tx=>{
        const job=await tx.processingJob.create({data:{jobType,episodeId:episode,mediaAssetId:asset.id}});
        return tx.sourceExtractionRun.create({data:{episodeId:episode,mediaAssetId:asset.id,streamId:stream?.id??null,streamIndex,method,provider:readiness.provider,providerVersion:readiness.version,modelVersion:readiness.model,languageRequested:settings.language,settings,settingsHash:extractionIdentity(asset.id,settings,readiness.provider,readiness.version,readiness.model,'settings'),identityHash,revision,processingJobId:job.id},include});
      });
      return toRun(run);
    } catch(error) {
      if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2002') return toRun(await this.db.sourceExtractionRun.findUniqueOrThrow({where:{identityHash},include}));
      throw error;
    }
  }
  async list(episodeId:string,query:unknown) {
    const id=idSchema.parse(episodeId); const {offset,limit}=paginationSchema.parse(query);
    if(!await this.db.episode.findUnique({where:{id}})) throw new AppError('EPISODE_NOT_FOUND','Episode not found.',404);
    const [runs,total]=await this.db.$transaction([this.db.sourceExtractionRun.findMany({where:{episodeId:id},include,orderBy:[{createdAt:'desc'},{id:'asc'}],skip:offset,take:limit}),this.db.sourceExtractionRun.count({where:{episodeId:id}})]);
    return {items:runs.map(toRun),total,offset,limit};
  }
  async get(runId:string) { const run=await this.db.sourceExtractionRun.findUnique({where:{id:idSchema.parse(runId)},include}); if(!run) throw new AppError('EXTRACTION_NOT_FOUND','Source extraction not found.',404); return run; }
  async detail(runId:string) { return toRun(await this.get(runId)); }
  async segments(runId:string,query:unknown) {
    const run=await this.get(runId); const {offset,limit}=paginationSchema.parse(query);
    const [segments,total]=await this.db.$transaction([this.db.sourceSegment.findMany({where:{extractionRunId:run.id},orderBy:[{startMs:'asc'},{sequence:'asc'}],skip:offset,take:limit}),this.db.sourceSegment.count({where:{extractionRunId:run.id}})]);
    return {run:toRun(run),items:segments.map(s=>toSourceSegment(s,run)),total,offset,limit};
  }
  async cancel(runId:string) {
    const run=await this.get(runId);
    await this.db.$transaction(async tx=>{
      // Locking the job row serializes cancellation with worker final persistence.
      const updated=await tx.processingJob.updateMany({where:{id:run.processingJobId,status:{in:[JobStatus.QUEUED,JobStatus.PROCESSING]}},data:{status:JobStatus.CANCELLED,errorCode:'CANCELLED',errorMessage:'Source extraction was cancelled.',completedAt:new Date()}});
      if(updated.count) await tx.sourceExtractionRun.update({where:{id:run.id},data:{status:JobStatus.CANCELLED,stage:'Cancelled',completedAt:new Date()}});
    });
    if(run.method==='ASR') void this.providers.asr.cancel(run.id);
    if(run.method==='OCR') void this.providers.ocr.cancel(run.id);
    return this.detail(run.id);
  }
}
