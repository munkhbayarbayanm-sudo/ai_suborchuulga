import {createHash} from 'node:crypto';
import type {Config} from '@mongolsub/config';
import {Prisma,type PrismaClient} from '@mongolsub/database';
import {AppError} from '@mongolsub/domain';
import {
  idSchema,localizationApprovalSchema,localizationPatchSchema,localizationProviderReadinessSchema,localizationQuerySchema,
  localizationRequestSchema,paginationSchema,seriesLocalizationProfileSchema,
} from '@mongolsub/contracts';
import {
  buildContextBatches,normalizeMemorySource,OpenAiLocalizationProvider,
  LOCALIZATION_PIPELINE_VERSION,LOCALIZATION_PROMPT_VERSION,type LocalizationSnapshot,type LocalizationSource,type TranslationProvider,
} from '@mongolsub/localization';
import {toJob} from './dto';
import {manualLocalizationUpdate} from './localization.state';

class DisabledLocalizationProvider implements TranslationProvider {
  readiness(){return {status:'UNAVAILABLE' as const,message:'Localization provider is disabled on this server.',provider:'disabled',model:''};}
  async localize():Promise<never>{throw new AppError('LOCALIZATION_PROVIDER_UNAVAILABLE','Localization provider is disabled on this server.',503);}
}

export function localizationProviderFromConfig(config:Config):TranslationProvider {
  if(config.LOCALIZATION_PROVIDER==='disabled')return new DisabledLocalizationProvider();
  return new OpenAiLocalizationProvider({apiKey:config.LOCALIZATION_API_KEY,model:config.LOCALIZATION_MODEL,baseUrl:config.LOCALIZATION_BASE_URL,timeoutMs:config.LOCALIZATION_TIMEOUT_MS,maxOutputTokens:config.LOCALIZATION_MAX_OUTPUT_TOKENS,maxAttempts:config.LOCALIZATION_MAX_ATTEMPTS,retryBaseMs:config.LOCALIZATION_RETRY_BASE_MS});
}

const iso=(date:Date|null)=>date?.toISOString()??null;
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
function stable(value:unknown):string {
  if(Array.isArray(value))return `[${value.map(stable).join(',')}]`;
  if(value&&typeof value==='object')return `{${Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  return JSON.stringify(value);
}
function json<T>(value:T):Prisma.InputJsonValue{return value as Prisma.InputJsonValue;}
function fromNullable(value:string|null|undefined):string{return value??'';}

const runInclude={processingJob:true,episode:{select:{activeLocalizationRunId:true}}} satisfies Prisma.LocalizationRunInclude;
type RunRow=Prisma.LocalizationRunGetPayload<{include:typeof runInclude}>;
function parseSettings(value:Prisma.JsonValue){return localizationRequestSchema.shape.settings.parse(value);}
function contextSummary(value:Prisma.JsonValue){
  const parsed=value as Partial<LocalizationSnapshot>;
  if(!parsed||typeof parsed!=='object')return null;
  return {characterCount:parsed.characters?.length??0,relationshipCount:parsed.relationships?.length??0,glossaryCount:parsed.glossary?.length??0,translationMemoryCount:parsed.translationMemory?.length??0,approvedLineCount:parsed.previousApprovedLines?.length??0,estimatedInputTokens:Math.ceil(JSON.stringify(value).length/3)};
}
function toRun(row:RunRow){return {
  id:row.id,episodeId:row.episodeId,fusionRunId:row.fusionRunId,sourceLanguage:row.sourceLanguage,targetLanguage:'mn' as const,mode:row.mode,
  provider:row.provider,model:row.model,providerVersion:row.providerVersion,promptVersion:row.promptVersion,pipelineVersion:row.pipelineVersion,
  settings:parseSettings(row.settings),status:row.status,stage:row.stage,processingJobId:row.processingJobId,job:toJob(row.processingJob),revision:row.revision,
  segmentCount:row.segmentCount,completedSegmentCount:row.completedSegmentCount,highConfidenceCount:row.highConfidenceCount,reviewRecommendedCount:row.reviewRecommendedCount,likelyProblemCount:row.likelyProblemCount,
  inputTokens:row.inputTokens,outputTokens:row.outputTokens,cachedTokens:row.cachedTokens,estimatedCost:row.estimatedCost,usageComplete:row.usageComplete,
  progress:row.processingJob.progress,contextSummary:contextSummary(row.contextSnapshot),batchCount:row.batchCount,completedBatchCount:row.completedBatchCount,
  processingDurationMs:row.processingDurationMs,isActive:row.episode.activeLocalizationRunId===row.id,createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString(),startedAt:iso(row.startedAt),completedAt:iso(row.completedAt),
};}
function toLocalized(row:Prisma.LocalizedSegmentGetPayload<Record<string,never>>){return {
  id:row.id,localizationRunId:row.localizationRunId,transcriptSegmentId:row.transcriptSegmentId,sequence:row.sequence,sourceTextSnapshot:row.sourceTextSnapshot,sourceStartMs:row.sourceStartMs,sourceEndMs:row.sourceEndMs,sourceConfidence:row.sourceConfidence,sourceReviewCategory:row.sourceReviewCategory,sourceReviewStatus:row.sourceReviewStatus,sourceEditRevision:row.sourceEditRevision,sourceSpeaker:row.sourceSpeaker,
  machineDraft:row.machineDraft,currentText:row.currentText,confidence:row.confidence,providerConfidence:row.providerConfidence,confidenceReasons:row.confidenceReasons,reviewClassification:row.reviewClassification,editState:row.editState,humanReviewState:row.humanReviewState,revision:row.revision,characterCount:row.characterCount,readingLoad:row.readingLoad,alternativeTranslation:row.alternativeTranslation,suggestedLineBreak:row.suggestedLineBreak,createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString(),
};}

export class LocalizationService {
  constructor(private readonly db:PrismaClient,private readonly provider:TranslationProvider){}
  readiness(){return localizationProviderReadinessSchema.parse(this.provider.readiness());}
  private async get(rawId:string){const row=await this.db.localizationRun.findUnique({where:{id:idSchema.parse(rawId)},include:runInclude});if(!row)throw new AppError('LOCALIZATION_NOT_FOUND','Localization run not found.',404);return row;}
  async detail(id:string){return toRun(await this.get(id));}
  async list(rawEpisodeId:string,query:unknown){const episodeId=idSchema.parse(rawEpisodeId);const {offset,limit}=paginationSchema.parse(query);const episode=await this.db.episode.findUnique({where:{id:episodeId},select:{activeLocalizationRunId:true}});if(!episode)throw new AppError('EPISODE_NOT_FOUND','Episode not found.',404);const [rows,total]=await this.db.$transaction([this.db.localizationRun.findMany({where:{episodeId},include:runInclude,orderBy:[{createdAt:'desc'},{id:'asc'}],skip:offset,take:limit}),this.db.localizationRun.count({where:{episodeId}})]);return {items:rows.map(toRun),total,offset,limit,activeRunId:episode.activeLocalizationRunId};}
  async create(rawEpisodeId:string,input:unknown){
    const episodeId=idSchema.parse(rawEpisodeId);const request=localizationRequestSchema.parse(input);const ready=this.provider.readiness();
    if(ready.status!=='READY')throw new AppError('LOCALIZATION_PROVIDER_UNAVAILABLE',ready.message,503);
    const fusion=await this.db.fusionRun.findUnique({where:{id:request.fusionRunId},include:{episode:{include:{series:true}},segments:{orderBy:{sequence:'asc'}}}});
    if(!fusion||fusion.episodeId!==episodeId)throw new AppError('FUSION_NOT_FOUND','Fusion run does not belong to this episode.',404);
    if(fusion.status!=='COMPLETED')throw new AppError('FUSION_NOT_COMPLETE','Select a completed fusion run.',409);
    if(!['en','zh'].includes(fusion.canonicalLanguage))throw new AppError('LOCALIZATION_LANGUAGE_UNSUPPORTED','Phase 04 supports English or Chinese source transcripts.');
    if(!fusion.segments.length)throw new AppError('LOCALIZATION_SOURCE_EMPTY','The selected fusion run has no canonical transcript segments.',409);
    const sources:LocalizationSource[]=fusion.segments.map(s=>({id:s.id,sequence:s.sequence,text:s.text,startMs:s.startMs,endMs:s.endMs,speaker:s.speaker,confidence:s.confidence,reviewCategory:s.reviewCategory,reviewStatus:s.reviewStatus,editRevision:s.editRevision}));
    const sourceHashes=[...new Set(sources.map(source=>hash(normalizeMemorySource(source.text))))];
    const [profileRow,characters,relationships,glossaryRows,tmRows,approvedRows]=await Promise.all([
      this.db.seriesLocalizationProfile.findUnique({where:{seriesId:fusion.episode.seriesId}}),
      this.db.character.findMany({where:{seriesId:fusion.episode.seriesId},include:{aliases:true},orderBy:[{canonicalName:'asc'},{id:'asc'}]}),
      this.db.characterRelationship.findMany({where:{seriesId:fusion.episode.seriesId},orderBy:[{type:'asc'},{id:'asc'}]}),
      this.db.glossaryEntry.findMany({where:{OR:[{scope:'GLOBAL'},{seriesId:fusion.episode.seriesId}]},orderBy:[{scope:'asc'},{sourceTerm:'asc'},{id:'asc'}]}),
      this.db.translationMemoryEntry.findMany({where:{seriesId:fusion.episode.seriesId,sourceLanguage:fusion.canonicalLanguage,normalizedSourceHash:{in:sourceHashes},status:'TRUSTED',origin:{in:['HUMAN_APPROVED','IMPORTED']}},include:{sourceLocalizedSegment:true},orderBy:[{updatedAt:'desc'},{id:'asc'}]}),
      this.db.localizedSegment.findMany({where:{localizationRun:{fusionRunId:fusion.id},humanReviewState:'APPROVED',currentText:{not:null}},select:{sequence:true,currentText:true,localizationRun:{select:{fusionRunId:true}}},orderBy:[{updatedAt:'desc'},{id:'asc'}]}),
    ]);
    const characterIds=new Set(characters.map(character=>character.id));
    if(request.settings.speakerBindings.some(binding=>!characterIds.has(binding.characterId)))throw new AppError('INVALID_CHARACTER','Speaker bindings must reference characters from this series.',400);
    const profile=seriesLocalizationProfileSchema.parse(profileRow?{defaultMode:profileRow.defaultMode,generalTone:profileRow.generalTone,setting:profileRow.setting,preferredStyle:profileRow.preferredStyle,formalityGuidance:profileRow.formalityGuidance,nameHandling:profileRow.nameHandling,specialNotes:profileRow.specialNotes}:{});
    const snapshot:LocalizationSnapshot={seriesId:fusion.episode.seriesId,episodeId,fusionRunId:fusion.id,sourceLanguage:fusion.canonicalLanguage as 'en'|'zh',profile,
      characters:characters.map(c=>({id:c.id,seriesId:c.seriesId,canonicalName:c.canonicalName,sourceName:c.sourceName,mongolianName:fromNullable(c.mongolianName),role:fromNullable(c.role),title:fromNullable(c.title),speakingStyle:fromNullable(c.speakingStyle),formality:fromNullable(c.formality),notes:fromNullable(c.notes),aliases:c.aliases.map(a=>({id:a.id,alias:a.alias}))})),
      relationships:relationships.map(r=>({id:r.id,seriesId:r.seriesId,fromCharacterId:r.fromCharacterId,toCharacterId:r.toCharacterId,type:r.type,notes:fromNullable(r.notes)})),
      glossary:glossaryRows.map(g=>({id:g.id,scope:g.scope,seriesId:g.seriesId,episodeId:g.episodeId,characterId:g.characterId,sourceLanguage:g.sourceLanguage as 'en'|'zh',sourceTerm:g.sourceTerm,preferredMongolian:g.preferredMongolian,notes:fromNullable(g.notes),caseSensitive:g.caseSensitive,status:g.status})),
      translationMemory:tmRows.filter(m=>m.origin==='IMPORTED'||(m.sourceLocalizedSegment?.humanReviewState==='APPROVED'&&m.sourceLocalizedSegment.revision===m.sourceRevision&&m.sourceLocalizedSegment.currentText===m.mongolianText)).map(m=>({id:m.id,seriesId:m.seriesId,sourceLanguage:m.sourceLanguage as 'en'|'zh',sourceText:m.sourceText,normalizedSourceText:m.normalizedSourceText,mongolianText:m.mongolianText,characterId:m.characterId,origin:m.origin,status:m.status,sourceLocalizedSegmentId:m.sourceLocalizedSegmentId,sourceRevision:m.sourceRevision})),
      previousApprovedLines:[...approvedRows.reduce((rows,row)=>{if(row.currentText&&!rows.has(row.sequence))rows.set(row.sequence,{fusionRunId:row.localizationRun.fusionRunId,sequence:row.sequence,text:row.currentText});return rows;},new Map<number,{fusionRunId:string;sequence:number;text:string}>()).values()].sort((a,b)=>a.sequence-b.sequence),
    };
    const batches=buildContextBatches(sources,snapshot,request.settings);const sourceSnapshotHash=hash(stable(sources));const contextHash=hash(stable(snapshot));const revision=request.rerunKey??'default';
    const identityHash=hash(stable({episodeId,fusionRunId:fusion.id,sourceSnapshotHash,contextHash,mode:request.mode,settings:request.settings,provider:ready.provider,model:ready.model,promptVersion:LOCALIZATION_PROMPT_VERSION,pipelineVersion:LOCALIZATION_PIPELINE_VERSION,revision}));
    const existing=await this.db.localizationRun.findUnique({where:{identityHash},include:runInclude});if(existing)return toRun(existing);
    try{return toRun(await this.db.$transaction(async tx=>{
      const job=await tx.processingJob.create({data:{jobType:'LOCALIZE_TRANSCRIPT',episodeId}});
      const run=await tx.localizationRun.create({data:{episodeId,fusionRunId:fusion.id,sourceLanguage:fusion.canonicalLanguage,targetLanguage:'mn',mode:request.mode,provider:ready.provider,model:ready.model,promptVersion:LOCALIZATION_PROMPT_VERSION,pipelineVersion:LOCALIZATION_PIPELINE_VERSION,settings:json(request.settings),contextSnapshot:json(snapshot),sourceSnapshotHash,identityHash,revision,processingJobId:job.id,segmentCount:sources.length,batchCount:batches.length}});
      await tx.localizedSegment.createMany({data:sources.map(s=>({localizationRunId:run.id,fusionRunId:fusion.id,transcriptSegmentId:s.id,sequence:s.sequence,sourceTextSnapshot:s.text,sourceStartMs:s.startMs,sourceEndMs:s.endMs,sourceConfidence:s.confidence,sourceReviewCategory:s.reviewCategory,sourceReviewStatus:s.reviewStatus,sourceEditRevision:s.editRevision,sourceSpeaker:s.speaker}))});
      await tx.localizationBatch.createMany({data:batches.map((batch,batchIndex)=>({localizationRunId:run.id,batchIndex,targetSegmentIds:json(batch.targets.map(target=>target.id))}))});
      return tx.localizationRun.findUniqueOrThrow({where:{id:run.id},include:runInclude});
    },{timeout:120000}));}catch(error){if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2002')return toRun(await this.db.localizationRun.findUniqueOrThrow({where:{identityHash},include:runInclude}));throw error;}
  }
  async segments(rawId:string,query:unknown){const run=await this.get(rawId);const {offset,limit,filter}=localizationQuerySchema.parse(query);const where:Prisma.LocalizedSegmentWhereInput={localizationRunId:run.id,currentText:{not:null},...(filter==='ALL'?{}:filter==='NEEDS_REVIEW'?{reviewClassification:{in:['REVIEW_RECOMMENDED','LIKELY_PROBLEM']}}:filter==='LIKELY_PROBLEM'?{reviewClassification:'LIKELY_PROBLEM'}:filter==='HIGH_CONFIDENCE'?{reviewClassification:'HIGH_CONFIDENCE'}:filter==='MANUAL'?{editState:'MANUALLY_EDITED'}:{humanReviewState:'APPROVED'})};const [items,total]=await this.db.$transaction([this.db.localizedSegment.findMany({where,orderBy:{sequence:'asc'},skip:offset,take:limit}),this.db.localizedSegment.count({where})]);return {run:toRun(run),items:items.map(toLocalized),total,offset,limit};}
  async segment(rawId:string){const row=await this.db.localizedSegment.findUnique({where:{id:idSchema.parse(rawId)}});if(!row||row.currentText===null)throw new AppError('LOCALIZED_SEGMENT_NOT_FOUND','Localized segment is not available.',404);return toLocalized(row);}
  async edit(rawId:string,input:unknown){const id=idSchema.parse(rawId);const patch=localizationPatchSchema.parse(input);if(patch.humanReviewState==='APPROVED')throw new AppError('USE_APPROVAL_ENDPOINT','Use the approval action to create trusted translation memory.',409);
    await this.db.$transaction(async tx=>{const row=await tx.localizedSegment.findUnique({where:{id}});if(!row||row.currentText===null)throw new AppError('LOCALIZED_SEGMENT_NOT_FOUND','Localized segment is not available.',404);const update=manualLocalizationUpdate({currentText:row.currentText,humanReviewState:row.humanReviewState},patch);const changed=patch.currentText!==undefined&&patch.currentText!==row.currentText;const result=await tx.localizedSegment.updateMany({where:{id,revision:patch.expectedRevision},data:{...update,revision:{increment:1}}});if(!result.count)throw new AppError('EDIT_CONFLICT','This localization changed. Reload it before saving.',409);if(changed||update.humanReviewState!=='APPROVED')await tx.translationMemoryEntry.updateMany({where:{sourceLocalizedSegmentId:id,status:'TRUSTED'},data:{status:'ARCHIVED'}});});return this.segment(id);}
  async approve(rawId:string,input:unknown){const id=idSchema.parse(rawId);const {expectedRevision}=localizationApprovalSchema.parse(input);await this.db.$transaction(async tx=>{const row=await tx.localizedSegment.findUnique({where:{id},include:{localizationRun:{include:{episode:{select:{seriesId:true}}}}}});if(!row||row.currentText===null)throw new AppError('LOCALIZED_SEGMENT_NOT_FOUND','Localized segment is not available.',404);const updated=await tx.localizedSegment.updateMany({where:{id,revision:expectedRevision},data:{humanReviewState:'APPROVED',revision:{increment:1}}});if(!updated.count)throw new AppError('EDIT_CONFLICT','This localization changed. Reload it before approving.',409);const normalizedSourceText=normalizeMemorySource(row.sourceTextSnapshot);const normalizedSourceHash=hash(normalizedSourceText);const identityHash=hash(stable({seriesId:row.localizationRun.episode.seriesId,sourceLanguage:row.localizationRun.sourceLanguage,normalizedSourceText,mongolianText:row.currentText,characterId:null}));await tx.translationMemoryEntry.upsert({where:{identityHash},create:{seriesId:row.localizationRun.episode.seriesId,sourceLanguage:row.localizationRun.sourceLanguage,sourceText:row.sourceTextSnapshot,normalizedSourceText,normalizedSourceHash,mongolianText:row.currentText,origin:'HUMAN_APPROVED',status:'TRUSTED',identityHash,sourceLocalizedSegmentId:id,sourceRevision:expectedRevision+1},update:{status:'TRUSTED',origin:'HUMAN_APPROVED',sourceLocalizedSegmentId:id,sourceRevision:expectedRevision+1,sourceText:row.sourceTextSnapshot,normalizedSourceText,normalizedSourceHash,mongolianText:row.currentText}});});return this.segment(id);}
  async activate(rawId:string){const run=await this.get(rawId);if(run.status!=='COMPLETED')throw new AppError('LOCALIZATION_NOT_COMPLETE','Only a completed localization run can be activated.',409);await this.db.episode.update({where:{id:run.episodeId},data:{activeLocalizationRunId:run.id}});return this.detail(run.id);}
  async cancel(rawId:string){const run=await this.get(rawId);await this.db.$transaction(async tx=>{const changed=await tx.processingJob.updateMany({where:{id:run.processingJobId,status:{in:['QUEUED','PROCESSING']}},data:{status:'CANCELLED',errorCode:'CANCELLED',errorMessage:'Localization cancelled.',completedAt:new Date()}});if(changed.count){await tx.localizationRun.update({where:{id:run.id},data:{status:'CANCELLED',stage:'Cancelled',completedAt:new Date()}});await tx.localizationBatch.updateMany({where:{localizationRunId:run.id,status:{in:['QUEUED','PROCESSING']}},data:{status:'CANCELLED',errorCode:'CANCELLED'}});}});return this.detail(run.id);}
  async resume(rawId:string){const run=await this.get(rawId);if(run.status!=='FAILED')throw new AppError('LOCALIZATION_NOT_RESUMABLE','Only a failed localization run can be resumed.',409);const ready=this.provider.readiness();if(ready.status!=='READY'||ready.provider!==run.provider||ready.model!==run.model)throw new AppError('LOCALIZATION_PROVIDER_CHANGED','Resume requires the same configured provider and model.',409);await this.db.$transaction(async tx=>{const job=await tx.processingJob.create({data:{jobType:'LOCALIZE_TRANSCRIPT',episodeId:run.episodeId}});const claimed=await tx.localizationRun.updateMany({where:{id:run.id,status:'FAILED',processingJobId:run.processingJobId},data:{processingJobId:job.id,status:'QUEUED',stage:'Queued',completedAt:null}});if(!claimed.count)throw new AppError('LOCALIZATION_NOT_RESUMABLE','This failed localization run was already resumed.',409);await tx.localizationBatch.updateMany({where:{localizationRunId:run.id,status:{in:['FAILED','CANCELLED','PROCESSING']}},data:{status:'QUEUED',errorCode:null}});});return this.detail(run.id);}
}
