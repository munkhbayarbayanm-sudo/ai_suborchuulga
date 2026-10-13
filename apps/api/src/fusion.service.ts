import {createHash} from 'node:crypto';
import {Prisma,type PrismaClient} from '@mongolsub/database';
import {AppError} from '@mongolsub/domain';
import {fusionRequestSchema,idSchema,paginationSchema,segmentEvidenceSchema,transcriptPatchSchema,transcriptQuerySchema} from '@mongolsub/contracts';
import {ALGORITHM_VERSION,recommendLanguage,languageFamily,type FusionInput} from '@mongolsub/fusion';
import {fusionInclude,transcriptInclude,toFusion,toTranscript} from './fusion.dto';
export class FusionService {
  constructor(private readonly db:PrismaClient){}
  async create(rawEpisodeId:string,input:unknown){
    const episodeId=idSchema.parse(rawEpisodeId);const request=fusionRequestSchema.parse(input);
    const asset=await this.db.mediaAsset.findUnique({where:{id:request.mediaAssetId},include:{episode:{include:{series:true}}}});
    if(!asset||asset.episodeId!==episodeId)throw new AppError('MEDIA_NOT_FOUND','Media does not belong to this episode.',404);
    if(asset.status!=='READY')throw new AppError('MEDIA_NOT_READY','Wait for media inspection.',409);
    const ids=[...request.inputRunIds].sort();
    const runs=await this.db.sourceExtractionRun.findMany({where:{id:{in:ids}},include:{_count:{select:{segments:true}}},orderBy:{id:'asc'}});
    if(runs.length!==ids.length||runs.some(run=>run.mediaAssetId!==asset.id||run.episodeId!==episodeId||run.status!=='COMPLETED'))throw new AppError('INVALID_FUSION_INPUT','Select completed extraction runs from this media asset.');
    if(runs.filter(run=>run.method==='EMBEDDED_SUBTITLE').length>1)throw new AppError('INVALID_FUSION_INPUT','Select at most one embedded subtitle run.');
    if(runs.reduce((sum,run)=>sum+run._count.segments,0)>50000)throw new AppError('FUSION_INPUT_LIMIT','Selected evidence exceeds the 50000 segment budget.');
    // Language recommendation is bounded evidence summarization only; alignment
    // and reconciliation always occur in the asynchronous worker.
    const segments=await this.db.sourceSegment.findMany({where:{extractionRunId:{in:ids}},select:{id:true,extractionRunId:true,sequence:true,startMs:true,endMs:true,text:true,language:true,confidence:true},orderBy:[{startMs:'asc'},{sequence:'asc'}]});
    const inputs:FusionInput[]=runs.map(run=>({id:run.id,method:run.method,segments:segments.filter(segment=>segment.extractionRunId===run.id).map(segment=>({...segmentEvidenceSchema.parse({...segment,speaker:null,words:[]}),id:segment.id,extractionRunId:run.id,sequence:segment.sequence}))}));
    const recommendation=recommendLanguage(inputs,asset.episode.sourceLanguage??asset.episode.series.sourceLanguage);
    const canonicalLanguage=request.language==='AUTO'?recommendation.language:request.language==='ENGLISH'?'en':'zh';
    if(!inputs.some(run=>run.segments.some(segment=>languageFamily(segment.language)===canonicalLanguage)))throw new AppError('FUSION_LANGUAGE_UNAVAILABLE','No usable evidence exists in the requested canonical language.');
    const revision=request.rerunKey??'default';
    const identityHash=createHash('sha256').update(JSON.stringify({asset:asset.id,ids,language:request.language,canonicalLanguage,settings:request.settings,algorithm:ALGORITHM_VERSION,revision})).digest('hex');
    const existing=await this.db.fusionRun.findUnique({where:{identityHash},include:fusionInclude});if(existing)return toFusion(existing);
    try {
      const result=await this.db.$transaction(async tx=>{const job=await tx.processingJob.create({data:{jobType:'FUSE_TRANSCRIPT',episodeId,mediaAssetId:asset.id}});const run=await tx.fusionRun.create({data:{episodeId,mediaAssetId:asset.id,requestedLanguage:request.language,canonicalLanguage,languageReason:request.language==='AUTO'?recommendation.reason:'Canonical language explicitly selected by user.',algorithmVersion:ALGORITHM_VERSION,settings:request.settings,revision,identityHash,processingJobId:job.id}});await tx.fusionRunInput.createMany({data:ids.map(sourceExtractionRunId=>({fusionRunId:run.id,sourceExtractionRunId,mediaAssetId:asset.id}))});return tx.fusionRun.findUniqueOrThrow({where:{id:run.id},include:fusionInclude});});
      return toFusion(result);
    }catch(error){if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2002')return toFusion(await this.db.fusionRun.findUniqueOrThrow({where:{identityHash},include:fusionInclude}));throw error;}
  }
  async get(rawId:string){const run=await this.db.fusionRun.findUnique({where:{id:idSchema.parse(rawId)},include:fusionInclude});if(!run)throw new AppError('FUSION_NOT_FOUND','Fusion run not found.',404);return run;}
  async detail(id:string){return toFusion(await this.get(id));}
  async list(rawEpisodeId:string,query:unknown){const episodeId=idSchema.parse(rawEpisodeId);const {offset,limit}=paginationSchema.parse(query);const episode=await this.db.episode.findUnique({where:{id:episodeId}});if(!episode)throw new AppError('EPISODE_NOT_FOUND','Episode not found.',404);const [rows,total]=await this.db.$transaction([this.db.fusionRun.findMany({where:{episodeId},include:fusionInclude,orderBy:[{createdAt:'desc'},{id:'asc'}],skip:offset,take:limit}),this.db.fusionRun.count({where:{episodeId}})]);return {items:rows.map(toFusion),total,offset,limit,activeRunId:episode.activeFusionRunId};}
  async segments(id:string,query:unknown){const run=await this.get(id);const {offset,limit,filter}=transcriptQuerySchema.parse(query);const where:Prisma.TranscriptSegmentWhereInput={fusionRunId:run.id,...(filter==='MANUAL'?{manualEditedAt:{not:null}}:filter==='ALL'?{}:{reviewCategory:filter})};
    if(run.status!=='COMPLETED')return {run:toFusion(run),items:[],total:0,offset,limit};
    const [rows,total]=await this.db.$transaction([this.db.transcriptSegment.findMany({where,include:transcriptInclude,orderBy:[{startMs:'asc'},{sequence:'asc'}],skip:offset,take:limit}),this.db.transcriptSegment.count({where})]);return {run:toFusion(run),items:rows.map(toTranscript),total,offset,limit};}
  async segment(rawId:string){const segment=await this.db.transcriptSegment.findUnique({where:{id:idSchema.parse(rawId)},include:{...transcriptInclude,fusionRun:{select:{status:true}}}});if(!segment||segment.fusionRun.status!=='COMPLETED')throw new AppError('TRANSCRIPT_NOT_FOUND','Completed transcript segment not found.',404);return toTranscript(segment);}
  async edit(rawId:string,input:unknown){const id=idSchema.parse(rawId);const patch=transcriptPatchSchema.parse(input);
    await this.db.$transaction(async tx=>{const segment=await tx.transcriptSegment.findUnique({where:{id},include:{fusionRun:{select:{status:true}}}});if(!segment||segment.fusionRun.status!=='COMPLETED')throw new AppError('TRANSCRIPT_NOT_FOUND','Completed transcript segment not found.',404);
      const startMs=patch.startMs??segment.startMs;const endMs=patch.endMs??segment.endMs;if(endMs<=startMs)throw new AppError('INVALID_TRANSCRIPT_TIMING','End must be after start.');
      const manual=(patch.text!==undefined&&patch.text!==segment.text)||startMs!==segment.startMs||endMs!==segment.endMs;
      const {expectedRevision,text,reviewStatus}=patch;
      const result=await tx.transcriptSegment.updateMany({where:{id,editRevision:expectedRevision},data:{startMs,endMs,...(text===undefined?{}:{text}),...(reviewStatus===undefined?(manual?{reviewStatus:'UNREVIEWED' as const}:{}):{reviewStatus}),...(manual?{manualEditedAt:new Date(),derivationType:'MANUAL' as const}:{}),editRevision:{increment:1}}});
      if(!result.count)throw new AppError('EDIT_CONFLICT','This segment changed. Reload it before saving.',409);
    });return this.segment(id);
  }
  async activate(id:string){const run=await this.get(id);if(run.status!=='COMPLETED')throw new AppError('FUSION_NOT_COMPLETE','Only a completed fusion run can be activated.',409);await this.db.episode.update({where:{id:run.episodeId},data:{activeFusionRunId:run.id}});return this.detail(run.id);}
  async cancel(id:string){const run=await this.get(id);await this.db.$transaction(async tx=>{const updated=await tx.processingJob.updateMany({where:{id:run.processingJobId,status:{in:['QUEUED','PROCESSING']}},data:{status:'CANCELLED',errorCode:'CANCELLED',errorMessage:'Transcript fusion cancelled.',completedAt:new Date()}});if(updated.count)await tx.fusionRun.update({where:{id:run.id},data:{status:'CANCELLED',stage:'Cancelled',completedAt:new Date()}});});return this.detail(run.id);}
}
