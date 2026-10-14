import {createHash,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import type {Config} from '@mongolsub/config';
import {
  createSubtitleDocumentSchema,editorCueQuerySchema,editorDocumentQuerySchema,editorOperationRequestSchema,editorPreparationRequestSchema,
  editorRevisionRequestSchema,editorRewriteDecisionSchema,editorRewriteProposalSchema,editorRewriteRequestSchema,idSchema,localizationSettingsSchema,subtitleCueSchema,subtitleDocumentDetailSchema,subtitleDocumentPageSchema,
  subtitleDocumentSchema,waveformSchema,type EditorOperationRequest,
} from '@mongolsub/contracts';
import {Prisma,type PrismaClient} from '@mongolsub/database';
import {AppError} from '@mongolsub/domain';
import {
  EDITOR_PROXY_SETTINGS,EDITOR_VERSION,WAVEFORM_SETTINGS,cueWarnings,directPlaybackMime,
  operationPayloadSchema,resolveHistoryTargets,splitCueText,type CueSnapshot,type OperationPayload,
} from '@mongolsub/editor';
import {assertLocalizationRequestBudget,buildContextBatches,localizationSnapshotSchema,validateTargetIds,type LocalizationSource,type TranslationProvider} from '@mongolsub/localization';
import type {StorageProvider} from '@mongolsub/storage';
import {toJob} from './dto';

const json=<T>(value:T)=>value as Prisma.InputJsonValue;
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const cueInclude={sourceLinks:{include:{localizedSegment:{include:{transcriptSegment:{include:{evidence:{include:{sourceSegment:true}}}}}}}}} satisfies Prisma.SubtitleCueInclude;
type CueRow=Prisma.SubtitleCueGetPayload<{include:typeof cueInclude}>;
type Tx=Prisma.TransactionClient;

function sourceWords(row:CueRow['sourceLinks'][number]['localizedSegment']){
  const unique=new Map<string,{text:string;startMs:number;endMs:number;confidence:number|null}>();
  for(const evidence of row.transcriptSegment.evidence){
    if(!Array.isArray(evidence.sourceSegment.words))continue;
    for(const raw of evidence.sourceSegment.words){
      if(!raw||typeof raw!=='object'||Array.isArray(raw))continue;const word=raw as Record<string,unknown>;
      if(typeof word.text!=='string'||!Number.isInteger(word.startMs)||!Number.isInteger(word.endMs)||Number(word.endMs)<=Number(word.startMs))continue;
      const confidence=typeof word.confidence==='number'&&word.confidence>=0&&word.confidence<=1?word.confidence:null;
      const item={text:word.text,startMs:Number(word.startMs),endMs:Number(word.endMs),confidence};unique.set(`${item.startMs}:${item.endMs}:${item.text}`,item);
    }
  }
  return[...unique.values()].sort((a,b)=>a.startMs-b.startMs||a.endMs-b.endMs);
}

function toDocument(row:{id:string;episodeId:string;mediaAssetId:string;localizationRunId:string;language:string;name:string;status:'READY'|'ARCHIVED';editorVersion:string;revision:number;createdAt:Date;updatedAt:Date;episode:{activeSubtitleDocumentId:string|null};mediaAsset:{durationMs:number|null};_count:{cues:number}}){
  return subtitleDocumentSchema.parse({id:row.id,episodeId:row.episodeId,mediaAssetId:row.mediaAssetId,localizationRunId:row.localizationRunId,language:row.language,name:row.name,status:row.status,editorVersion:row.editorVersion,revision:row.revision,isActive:row.episode.activeSubtitleDocumentId===row.id,cueCount:row._count.cues,durationMs:row.mediaAsset.durationMs??0,createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString()});
}

function toCue(row:CueRow,allTimings:readonly {id:string;startMs:number;endMs:number}[],durationMs:number){
  const sources=row.sourceLinks.map(link=>{const localized=link.localizedSegment;return{localizedSegmentId:localized.id,transcriptSegmentId:localized.transcriptSegmentId,sequence:localized.sequence,sourceText:localized.sourceTextSnapshot,localizedText:localized.currentText??'',reviewClassification:localized.reviewClassification,humanReviewState:localized.humanReviewState,editState:localized.editState,confidence:localized.confidence,confidenceReasons:localized.confidenceReasons,speaker:localized.sourceSpeaker,words:sourceWords(localized)};});
  return subtitleCueSchema.parse({id:row.id,subtitleDocumentId:row.subtitleDocumentId,sequence:row.sequence,startMs:row.startMs,endMs:row.endMs,text:row.text,status:row.status,origin:row.origin,revision:row.revision,deletedAt:row.deletedAt?.toISOString()??null,createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString(),sources,warnings:cueWarnings(row,allTimings.map(item=>({...item,sequence:0,text:'',revision:0})),durationMs)});
}

function snapshot(row:{id:string;sequence:number;startMs:number;endMs:number;text:string;status:'NORMAL'|'REVIEW'|'APPROVED';origin:'LOCALIZED'|'MANUAL';revision:number;deletedAt:Date|null;sourceLinks:{localizedSegmentId:string}[]}):CueSnapshot{
  return{id:row.id,sequence:row.sequence,startMs:row.startMs,endMs:row.endMs,text:row.text,status:row.status,origin:row.origin,revision:row.revision,deletedAt:row.deletedAt?.toISOString()??null,localizedSegmentIds:row.sourceLinks.map(link=>link.localizedSegmentId).sort()};
}
function toProposal(row:{id:string;subtitleDocumentId:string;subtitleCueId:string;action:'RETRANSLATE'|'MAKE_NATURAL'|'SHORTER'|'MORE_FORMAL'|'MORE_CASUAL'|'CLOSER_TO_SOURCE';status:'PENDING'|'ACCEPTED'|'REJECTED'|'SUPERSEDED';baseDocumentRevision:number;currentTextSnapshot:string;proposalText:string;provider:string;model:string;providerVersion:string|null;confidence:number|null;notes:Prisma.JsonValue;createdAt:Date;updatedAt:Date}){return editorRewriteProposalSchema.parse({id:row.id,subtitleDocumentId:row.subtitleDocumentId,subtitleCueId:row.subtitleCueId,action:row.action,status:row.status,baseDocumentRevision:row.baseDocumentRevision,currentTextSnapshot:row.currentTextSnapshot,proposalText:row.proposalText,provider:row.provider,model:row.model,providerVersion:row.providerVersion,confidence:row.confidence,notes:row.notes,createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString()});}
function rethrowEditorTransaction(error:unknown):never{if(error instanceof Prisma.PrismaClientKnownRequestError&&(error.code==='P2034'||error.code==='P2010'))throw new AppError('EDITOR_CONCURRENT_CHANGE','Another editor change completed first. Reload and try again.',409);throw error;}

export class EditorService{
  constructor(private readonly db:PrismaClient,private readonly storage:StorageProvider,private readonly config:Config,private readonly localizationProvider:TranslationProvider){}

  async listDocuments(rawEpisodeId:string,input:unknown){
    const episodeId=idSchema.parse(rawEpisodeId);const query=editorDocumentQuerySchema.parse(input);
    const [episode,total,rows]=await Promise.all([
      this.db.episode.findUnique({where:{id:episodeId},select:{activeSubtitleDocumentId:true}}),
      this.db.subtitleDocument.count({where:{episodeId}}),
      this.db.subtitleDocument.findMany({where:{episodeId},orderBy:{createdAt:'desc'},skip:query.offset,take:query.limit,include:{episode:{select:{activeSubtitleDocumentId:true}},mediaAsset:{select:{durationMs:true}},_count:{select:{cues:{where:{deletedAt:null}}}}}}),
    ]);
    if(!episode)throw new AppError('EPISODE_NOT_FOUND','Episode not found.',404);
    return subtitleDocumentPageSchema.parse({items:rows.map(toDocument),total,offset:query.offset,limit:query.limit,activeDocumentId:episode.activeSubtitleDocumentId});
  }

  async createDocument(rawLocalizationRunId:string,input:unknown){
    const localizationRunId=idSchema.parse(rawLocalizationRunId);const request=createSubtitleDocumentSchema.parse(input);const initializationKey=request.initializationKey??'default';
    const run=await this.db.localizationRun.findUnique({where:{id:localizationRunId},include:{fusionRun:{select:{mediaAssetId:true}},segments:{orderBy:{sequence:'asc'},include:{transcriptSegment:{select:{startMs:true,endMs:true}}}}}});
    if(!run)throw new AppError('LOCALIZATION_RUN_NOT_FOUND','Localization run not found.',404);
    if(run.status!=='COMPLETED')throw new AppError('LOCALIZATION_RUN_NOT_COMPLETED','Only a completed localization can initialize subtitle editing.',409);
    const asset=await this.db.mediaAsset.findUnique({where:{id:run.fusionRun.mediaAssetId},select:{durationMs:true}});const durationMs=asset?.durationMs;
    if(!durationMs)throw new AppError('MEDIA_DURATION_UNAVAILABLE','Editor initialization requires inspected media duration.',409);
    if(run.segments.some(segment=>!segment.currentText))throw new AppError('LOCALIZATION_INCOMPLETE','Every localization segment must contain current Mongolian text.',409);
    const identityHash=hash({localizationRunId,initializationKey,editorVersion:EDITOR_VERSION});
    try{
      const document=await this.db.$transaction(async tx=>{
        const existing=await tx.subtitleDocument.findUnique({where:{localizationRunId_initializationKey:{localizationRunId,initializationKey}}});if(existing)return existing;
        const created=await tx.subtitleDocument.create({data:{episodeId:run.episodeId,mediaAssetId:run.fusionRun.mediaAssetId,localizationRunId,name:request.name,editorVersion:EDITOR_VERSION,initializationKey,identityHash}});
        const cues=run.segments.map(segment=>{const endMs=Math.min(segment.transcriptSegment.endMs,durationMs);if(segment.transcriptSegment.startMs>=endMs)throw new AppError('INVALID_CUE_TIMING','A source localization falls outside media duration.',422);return{id:randomUUID(),subtitleDocumentId:created.id,localizationRunId,sequence:segment.sequence,startMs:segment.transcriptSegment.startMs,endMs,text:segment.currentText!,status:segment.humanReviewState==='APPROVED'?'APPROVED' as const:segment.reviewClassification==='HIGH_CONFIDENCE'?'NORMAL' as const:'REVIEW' as const,origin:'LOCALIZED' as const,revision:0,localizedSegmentId:segment.id};});
        for(let offset=0;offset<cues.length;offset+=250){const batch=cues.slice(offset,offset+250);await tx.subtitleCue.createMany({data:batch.map(({localizedSegmentId:_,...cue})=>cue)});await tx.subtitleCueSourceLink.createMany({data:batch.map(cue=>({subtitleCueId:cue.id,localizedSegmentId:cue.localizedSegmentId,localizationRunId}))});}
        return created;
      },{timeout:120000});
      await this.ensureEditorMedia(document.id);
      return this.detail(document.id);
    }catch(error){if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2002'){const existing=await this.db.subtitleDocument.findUnique({where:{localizationRunId_initializationKey:{localizationRunId,initializationKey}}});if(existing)return this.detail(existing.id);}throw error;}
  }

  async activate(rawId:string){const id=idSchema.parse(rawId);const document=await this.db.subtitleDocument.findUnique({where:{id}});if(!document)throw new AppError('SUBTITLE_DOCUMENT_NOT_FOUND','Subtitle document not found.',404);await this.db.episode.update({where:{id:document.episodeId},data:{activeSubtitleDocumentId:id}});return this.detail(id);}

  private async documentRow(id:string){const row=await this.db.subtitleDocument.findUnique({where:{id},include:{episode:{select:{activeSubtitleDocumentId:true}},mediaAsset:{select:{durationMs:true,streams:true,mimeType:true,containerFormat:true}},_count:{select:{cues:{where:{deletedAt:null}}}}}});if(!row)throw new AppError('SUBTITLE_DOCUMENT_NOT_FOUND','Subtitle document not found.',404);return row;}

  private preparationSettings(document:Awaited<ReturnType<EditorService['documentRow']>>){
    const audio=document.mediaAsset.streams.find(stream=>stream.type==='AUDIO');
    const proxy={...EDITOR_PROXY_SETTINGS};
    const waveform=audio?{...WAVEFORM_SETTINGS,resolutionsMs:[...WAVEFORM_SETTINGS.resolutionsMs],streamIndex:audio.streamIndex}:null;
    return{proxy,proxyHash:hash(proxy),waveform,waveformHash:waveform?hash(waveform):null};
  }

  private waveformSettings(streams:readonly {type:string;streamIndex:number}[]){const audio=streams.find(stream=>stream.type==='AUDIO');return audio?{...WAVEFORM_SETTINGS,resolutionsMs:[...WAVEFORM_SETTINGS.resolutionsMs],streamIndex:audio.streamIndex}:null;}

  async detail(rawId:string){
    const id=idSchema.parse(rawId);const row=await this.documentRow(id);const operations=await this.db.editorOperation.findMany({where:{subtitleDocumentId:id},orderBy:{resultRevision:'asc'},select:{id:true,type:true,targetOperationId:true}});const history=resolveHistoryTargets(operations);
    const settings=this.preparationSettings(row);const preparations=await this.db.editorMediaPreparation.findMany({where:{mediaAssetId:row.mediaAssetId,OR:[{kind:'EDITOR_PROXY',settingsHash:settings.proxyHash},...(settings.waveformHash?[{kind:'WAVEFORM' as const,settingsHash:settings.waveformHash}]:[])]},include:{processingJob:true,derivative:true}});const direct=directPlaybackMime(row.mediaAsset);const proxy=preparations.find(item=>item.kind==='EDITOR_PROXY'&&item.settingsHash===settings.proxyHash);const waveform=preparations.find(item=>item.kind==='WAVEFORM'&&item.settingsHash===settings.waveformHash);
    const previewStatus=direct?'COMPLETED':proxy?.status??'MISSING';const waveformStatus=waveform?.status??'MISSING';
    return subtitleDocumentDetailSchema.parse({document:toDocument(row),history:{canUndo:history.undoOperationId!==null,canRedo:history.redoOperationId!==null,...history},media:{sourceAssetId:row.mediaAssetId,playbackUrl:`/subtitle-documents/${id}/playback`,playbackKind:direct?'SOURCE':'PROXY',previewStatus,previewMessage:direct?'Source media is browser compatible.':previewStatus==='COMPLETED'?'Editor proxy ready.':previewStatus==='FAILED'?'Editor proxy failed.':'Preparing browser-safe preview…',waveformStatus,waveformMessage:waveformStatus==='COMPLETED'?'Waveform ready.':waveformStatus==='FAILED'?'Waveform generation failed.':'Preparing waveform…',waveformUrl:waveformStatus==='COMPLETED'?`/subtitle-documents/${id}/waveform`:null,previewJob:proxy?toJob(proxy.processingJob):null,waveformJob:waveform?toJob(waveform.processingJob):null}});
  }

  async listCues(rawId:string,input:unknown){
    const id=idSchema.parse(rawId);const query=editorCueQuerySchema.parse(input);const document=await this.documentRow(id);const where:Prisma.SubtitleCueWhereInput={subtitleDocumentId:id,deletedAt:null};
    if(query.startMs!==undefined||query.endMs!==undefined)where.AND=[...(query.startMs===undefined?[]:[{endMs:{gt:query.startMs}}]),...(query.endMs===undefined?[]:[{startMs:{lt:query.endMs}}])];
    if(query.filter==='REVIEW')where.status='REVIEW';else if(query.filter==='APPROVED')where.status='APPROVED';else if(query.filter==='MANUAL')where.origin='MANUAL';else if(query.filter==='LIKELY_PROBLEM')where.sourceLinks={some:{localizedSegment:{reviewClassification:'LIKELY_PROBLEM'}}};else if(query.filter==='ISSUES')where.OR=[{status:'REVIEW'},{text:''},{sourceLinks:{some:{localizedSegment:{reviewClassification:{in:['REVIEW_RECOMMENDED','LIKELY_PROBLEM']}}}}}];
    const [total,rows,timings]=await Promise.all([this.db.subtitleCue.count({where}),this.db.subtitleCue.findMany({where,orderBy:[{sequence:'asc'},{id:'asc'}],skip:query.offset,take:query.limit,include:cueInclude}),this.db.subtitleCue.findMany({where:{subtitleDocumentId:id,deletedAt:null},select:{id:true,startMs:true,endMs:true}})]);
    return{document:toDocument(document),items:rows.map(row=>toCue(row,timings,document.mediaAsset.durationMs??0)),total,offset:query.offset,limit:query.limit};
  }

  async getCue(rawId:string){const id=idSchema.parse(rawId);const row=await this.db.subtitleCue.findUnique({where:{id},include:cueInclude});if(!row||row.deletedAt)throw new AppError('SUBTITLE_CUE_NOT_FOUND','Subtitle cue not found.',404);const document=await this.documentRow(row.subtitleDocumentId);const timings=await this.db.subtitleCue.findMany({where:{subtitleDocumentId:row.subtitleDocumentId,deletedAt:null},select:{id:true,startMs:true,endMs:true}});return toCue(row,timings,document.mediaAsset.durationMs??0);}

  async rewrite(rawCueId:string,input:unknown){
    const cueId=idSchema.parse(rawCueId);const request=editorRewriteRequestSchema.parse(input);const cue=await this.db.subtitleCue.findUnique({where:{id:cueId},include:{document:{include:{localizationRun:{include:{segments:{orderBy:{sequence:'asc'}}}}}},sourceLinks:{include:{localizedSegment:true}}}});if(!cue||cue.deletedAt)throw new AppError('SUBTITLE_CUE_NOT_FOUND','Subtitle cue not found.',404);if(cue.document.revision!==request.baseRevision)throw new AppError('EDITOR_REVISION_CONFLICT','This subtitle document changed before rewrite.',409);if(!cue.sourceLinks.length)throw new AppError('AI_REWRITE_SOURCE_REQUIRED','AI rewrite requires localized source provenance.',422);
    const readiness=this.localizationProvider.readiness();if(readiness.status!=='READY')throw new AppError('LOCALIZATION_PROVIDER_UNAVAILABLE',readiness.message,503);
    const run=cue.document.localizationRun;const snapshotData=localizationSnapshotSchema.parse(run.contextSnapshot);const settings=localizationSettingsSchema.parse(run.settings);const sourceRows=cue.sourceLinks.map(link=>link.localizedSegment).sort((a,b)=>a.sequence-b.sequence);const category=sourceRows.some(row=>row.sourceReviewCategory==='LIKELY_PROBLEM')?'LIKELY_PROBLEM':sourceRows.some(row=>row.sourceReviewCategory==='REVIEW_RECOMMENDED')?'REVIEW_RECOMMENDED':'HIGH_CONFIDENCE';const reviewStatus=sourceRows.every(row=>row.sourceReviewStatus==='APPROVED')?'APPROVED':sourceRows.some(row=>row.sourceReviewStatus==='REVIEWED')?'REVIEWED':'UNREVIEWED';
    const source:LocalizationSource={id:cue.id,sequence:cue.sequence,text:sourceRows.map(row=>row.sourceTextSnapshot).join('\n'),startMs:cue.startMs,endMs:cue.endMs,speaker:sourceRows.map(row=>row.sourceSpeaker).find(value=>value!==null)??null,confidence:Math.min(...sourceRows.map(row=>row.sourceConfidence)),reviewCategory:category,reviewStatus,editRevision:Math.max(...sourceRows.map(row=>row.sourceEditRevision))};const batch=buildContextBatches([source],snapshotData,{...settings,batchSize:1})[0];if(!batch)throw new AppError('AI_REWRITE_CONTEXT_FAILED','Could not build rewrite context.',422);
    const neighbors=await this.db.subtitleCue.findMany({where:{subtitleDocumentId:cue.subtitleDocumentId,deletedAt:null,OR:[{sequence:{lt:cue.sequence}},{sequence:{gt:cue.sequence}}]},orderBy:{sequence:'asc'},select:{sequence:true,text:true}});const before=neighbors.filter(row=>row.sequence<cue.sequence).slice(-3);const after=neighbors.filter(row=>row.sequence>cue.sequence).slice(0,3);const providerInput={phase:'REWRITE' as const,mode:run.mode,sourceLanguage:run.sourceLanguage as 'en'|'zh',batch,rewrite:{action:request.action,currentText:cue.text,linkedSourceIds:sourceRows.map(row=>row.id),neighborCueTexts:[...before,...after].map(row=>row.text)}};assertLocalizationRequestBudget(providerInput,settings.maxProviderRequestCharacters);const result=await this.localizationProvider.localize(providerInput);const proposal=validateTargetIds([cue.id],result.segments)[0]!;
    const saved=await this.db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM "SubtitleDocument" WHERE id = ${cue.subtitleDocumentId}::uuid FOR UPDATE`;const currentDocument=await tx.subtitleDocument.findUniqueOrThrow({where:{id:cue.subtitleDocumentId}});const currentCue=await tx.subtitleCue.findUniqueOrThrow({where:{id:cue.id}});if(currentDocument.revision!==request.baseRevision||currentCue.text!==cue.text||currentCue.deletedAt)throw new AppError('EDITOR_REVISION_CONFLICT','Cue changed while the rewrite proposal was generated.',409);await tx.editorRewriteProposal.updateMany({where:{subtitleCueId:cue.id,status:'PENDING'},data:{status:'SUPERSEDED'}});return tx.editorRewriteProposal.create({data:{subtitleDocumentId:cue.subtitleDocumentId,subtitleCueId:cue.id,action:request.action,baseDocumentRevision:request.baseRevision,currentTextSnapshot:cue.text,proposalText:proposal.translation,provider:readiness.provider,model:result.model,providerVersion:result.providerVersion,confidence:proposal.providerConfidence,notes:json(proposal.issues),usage:json(result.usage)}});});
    return toProposal(saved);
  }

  async rejectRewrite(rawId:string,input:unknown){
    const id=idSchema.parse(rawId);const request=editorRewriteDecisionSchema.parse(input);
    const saved=await this.db.$transaction(async tx=>{
      const initial=await tx.editorRewriteProposal.findUnique({where:{id},select:{subtitleDocumentId:true}});if(!initial)throw new AppError('REWRITE_PROPOSAL_NOT_FOUND','Rewrite proposal not found.',404);
      await tx.$queryRaw`SELECT id FROM "SubtitleDocument" WHERE id = ${initial.subtitleDocumentId}::uuid FOR UPDATE`;
      const proposal=await tx.editorRewriteProposal.findUnique({where:{id},include:{document:true}});if(!proposal)throw new AppError('REWRITE_PROPOSAL_NOT_FOUND','Rewrite proposal not found.',404);if(proposal.document.revision!==request.baseRevision)throw new AppError('EDITOR_REVISION_CONFLICT','Document changed before rejecting the proposal.',409);if(proposal.status!=='PENDING')throw new AppError('REWRITE_PROPOSAL_DECIDED','Rewrite proposal was already decided.',409);
      const changed=await tx.editorRewriteProposal.updateMany({where:{id,status:'PENDING'},data:{status:'REJECTED'}});if(!changed.count)throw new AppError('REWRITE_PROPOSAL_DECIDED','Rewrite proposal was already decided.',409);return tx.editorRewriteProposal.findUniqueOrThrow({where:{id}});
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:30000}).catch(rethrowEditorTransaction);return toProposal(saved);
  }

  private async loadSnapshot(tx:Tx,documentId:string,cueId:string){const row=await tx.subtitleCue.findFirst({where:{id:cueId,subtitleDocumentId:documentId},include:{sourceLinks:{select:{localizedSegmentId:true}}}});if(!row||row.deletedAt)throw new AppError('SUBTITLE_CUE_NOT_FOUND','Subtitle cue not found.',404);return snapshot(row);}
  private validateSnapshot(item:CueSnapshot,durationMs:number){if(item.startMs<0||item.endMs<=item.startMs||item.endMs>durationMs)throw new AppError('INVALID_CUE_TIMING','Cue timing must remain inside media duration.',422);}
  private async applyPayload(tx:Tx,document:{id:string;localizationRunId:string},payload:OperationPayload,durationMs:number){
    for(const item of payload.cues){this.validateSnapshot(item,durationMs);const data={sequence:item.sequence,startMs:item.startMs,endMs:item.endMs,text:item.text,status:item.status,origin:item.origin,revision:item.revision,deletedAt:item.deletedAt?new Date(item.deletedAt):null};const existing=await tx.subtitleCue.findUnique({where:{id:item.id},select:{id:true,subtitleDocumentId:true}});if(existing&&existing.subtitleDocumentId!==document.id)throw new AppError('SUBTITLE_CUE_OWNERSHIP','Cue does not belong to this document.',409);if(existing)await tx.subtitleCue.update({where:{id:item.id},data});else await tx.subtitleCue.create({data:{id:item.id,subtitleDocumentId:document.id,localizationRunId:document.localizationRunId,...data}});await tx.subtitleCueSourceLink.deleteMany({where:{subtitleCueId:item.id}});if(item.localizedSegmentIds.length)await tx.subtitleCueSourceLink.createMany({data:item.localizedSegmentIds.map(localizedSegmentId=>({subtitleCueId:item.id,localizedSegmentId,localizationRunId:document.localizationRunId}))});}
    const active=await tx.subtitleCue.findMany({where:{subtitleDocumentId:document.id,deletedAt:null},orderBy:[{startMs:'asc'},{endMs:'asc'},{id:'asc'}],select:{id:true,sequence:true}});for(let sequence=0;sequence<active.length;sequence++)if(active[sequence]!.sequence!==sequence)await tx.subtitleCue.update({where:{id:active[sequence]!.id},data:{sequence}});
  }

  private async forwardPayload(tx:Tx,document:{id:string;localizationRunId:string;revision:number;mediaAsset:{durationMs:number|null}},request:EditorOperationRequest){
    const duration=document.mediaAsset.durationMs;if(!duration)throw new AppError('MEDIA_DURATION_UNAVAILABLE','Editor operations require media duration.',409);
    if(request.type==='CREATE_CUE'){const payload=request.payload;const item:CueSnapshot={id:randomUUID(),sequence:0,startMs:payload.startMs,endMs:payload.endMs,text:payload.text,status:'REVIEW',origin:'MANUAL',revision:0,deletedAt:null,localizedSegmentIds:[]};this.validateSnapshot(item,duration);return{before:{cues:[{...item,deletedAt:new Date().toISOString()}]},after:{cues:[item]}};}
    if(request.type==='MERGE_CUES'){
      const payload=request.payload;
      const rows=await tx.subtitleCue.findMany({where:{id:{in:payload.cueIds},subtitleDocumentId:document.id,deletedAt:null},include:{sourceLinks:{select:{localizedSegmentId:true}}},orderBy:{sequence:'asc'}});if(rows.length!==payload.cueIds.length)throw new AppError('SUBTITLE_CUE_NOT_FOUND','Every selected cue must be active in this document.',404);for(let index=1;index<rows.length;index++)if(rows[index]!.sequence!==rows[index-1]!.sequence+1)throw new AppError('CUES_NOT_ADJACENT','Only adjacent cues can be merged.',422);
      const before=rows.map(snapshot);const deleted=before.map(item=>({...item,revision:item.revision+1,deletedAt:new Date().toISOString(),status:'REVIEW' as const}));const merged:CueSnapshot={id:randomUUID(),sequence:before[0]!.sequence,startMs:Math.min(...before.map(item=>item.startMs)),endMs:Math.max(...before.map(item=>item.endMs)),text:before.map(item=>item.text.trim()).filter(Boolean).join(payload.separator==='LINE_BREAK'?'\n':' '),status:'REVIEW',origin:before.some(item=>item.localizedSegmentIds.length)?'LOCALIZED':'MANUAL',revision:0,deletedAt:null,localizedSegmentIds:[...new Set(before.flatMap(item=>item.localizedSegmentIds))].sort()};return{before:{cues:[...before,{...merged,deletedAt:new Date().toISOString()}]},after:{cues:[...deleted,merged]}};
    }
    const cueId=request.payload.cueId;const beforeCue=await this.loadSnapshot(tx,document.id,cueId);let after:CueSnapshot[];
    if(request.type==='UPDATE_TEXT'){const payload=request.payload;after=[{...beforeCue,text:payload.text,revision:beforeCue.revision+1,status:beforeCue.text===payload.text?beforeCue.status:'REVIEW'}];}
    else if(request.type==='MOVE_CUE'){const payload=request.payload;if(payload.endMs-payload.startMs!==beforeCue.endMs-beforeCue.startMs)throw new AppError('INVALID_MOVE','Moving a cue must preserve duration.',422);after=[{...beforeCue,startMs:payload.startMs,endMs:payload.endMs,revision:beforeCue.revision+1,status:'REVIEW'}];}
    else if(request.type==='RESIZE_START'){const payload=request.payload;if(payload.endMs!==beforeCue.endMs)throw new AppError('INVALID_RESIZE','Start resize must preserve cue end.',422);after=[{...beforeCue,startMs:payload.startMs,revision:beforeCue.revision+1,status:'REVIEW'}];}
    else if(request.type==='RESIZE_END'){const payload=request.payload;if(payload.startMs!==beforeCue.startMs)throw new AppError('INVALID_RESIZE','End resize must preserve cue start.',422);after=[{...beforeCue,endMs:payload.endMs,revision:beforeCue.revision+1,status:'REVIEW'}];}
    else if(request.type==='DELETE_CUE')after=[{...beforeCue,revision:beforeCue.revision+1,deletedAt:new Date().toISOString(),status:'REVIEW'}];
    else if(request.type==='SET_CUE_STATUS'){const payload=request.payload;after=[{...beforeCue,revision:beforeCue.revision+1,status:payload.status}];}
    else if(request.type==='SPLIT_CUE'){
      const payload=request.payload;
      if(payload.splitMs<=beforeCue.startMs||payload.splitMs>=beforeCue.endMs)throw new AppError('INVALID_SPLIT','Place the playhead inside the selected cue.',422);const relative=(payload.splitMs-beforeCue.startMs)/(beforeCue.endMs-beforeCue.startMs);const parts=splitCueText(beforeCue.text,relative,payload.caret);if(!parts.left||!parts.right)throw new AppError('INVALID_SPLIT_TEXT','Split requires text on both sides.',422);const common={sequence:beforeCue.sequence,status:'REVIEW' as const,origin:beforeCue.origin,revision:0,deletedAt:null,localizedSegmentIds:beforeCue.localizedSegmentIds};const left:CueSnapshot={id:randomUUID(),startMs:beforeCue.startMs,endMs:payload.splitMs,text:parts.left,...common};const right:CueSnapshot={id:randomUUID(),startMs:payload.splitMs,endMs:beforeCue.endMs,text:parts.right,...common};after=[{...beforeCue,revision:beforeCue.revision+1,deletedAt:new Date().toISOString(),status:'REVIEW'},left,right];for(const item of after)this.validateSnapshot(item,duration);return{before:{cues:[beforeCue,{...left,deletedAt:new Date().toISOString()},{...right,deletedAt:new Date().toISOString()}]},after:{cues:after}};
    }else if(request.type==='ACCEPT_AI_REWRITE'){
      const payload=request.payload;
      const proposal=await tx.editorRewriteProposal.findFirst({where:{id:payload.proposalId,subtitleDocumentId:document.id,subtitleCueId:cueId,status:'PENDING'}});if(!proposal)throw new AppError('REWRITE_PROPOSAL_NOT_FOUND','Rewrite proposal is no longer available.',404);if(proposal.currentTextSnapshot!==beforeCue.text)throw new AppError('REWRITE_PROPOSAL_STALE','Cue text changed after this proposal was created.',409);after=[{...beforeCue,text:proposal.proposalText,revision:beforeCue.revision+1,status:'REVIEW'}];
    }else throw new AppError('INVALID_EDITOR_OPERATION','Unsupported editor operation.',422);
    for(const item of after)this.validateSnapshot(item,duration);return{before:{cues:[beforeCue]},after:{cues:after}};
  }

  async operate(rawId:string,input:unknown){
    const id=idSchema.parse(rawId);const request=editorOperationRequestSchema.parse(input);
    const result=await this.db.$transaction(async tx=>{
      if(request.clientOperationId){const existing=await tx.editorOperation.findUnique({where:{subtitleDocumentId_clientOperationId:{subtitleDocumentId:id,clientOperationId:request.clientOperationId}}});if(existing)return{operation:existing,payload:operationPayloadSchema.parse(existing.afterPayload)};}
      await tx.$queryRaw`SELECT id FROM "SubtitleDocument" WHERE id = ${id}::uuid FOR UPDATE`;
      const document=await tx.subtitleDocument.findUnique({where:{id},include:{mediaAsset:{select:{durationMs:true}}}});if(!document)throw new AppError('SUBTITLE_DOCUMENT_NOT_FOUND','Subtitle document not found.',404);if(document.revision!==request.baseRevision)throw new AppError('EDITOR_REVISION_CONFLICT','This subtitle document changed. Reload before applying the pending edit.',409,{expected:request.baseRevision,current:document.revision});
      const built=await this.forwardPayload(tx,document,request);const before=operationPayloadSchema.parse(built.before);const after=operationPayloadSchema.parse(built.after);await this.applyPayload(tx,document,after,document.mediaAsset.durationMs??0);
      const operation=await tx.editorOperation.create({data:{subtitleDocumentId:id,type:request.type,baseRevision:document.revision,resultRevision:document.revision+1,beforePayload:json(before),afterPayload:json(after),clientOperationId:request.clientOperationId}});await tx.subtitleDocument.update({where:{id},data:{revision:{increment:1}}});await tx.qCRun.updateMany({where:{status:'COMPLETED',documents:{some:{subtitleDocumentId:id}}},data:{status:'STALE',stage:'Document changed after QC'}});
      const affected=after.cues.map(cue=>cue.id);const acceptedProposalId=request.type==='ACCEPT_AI_REWRITE'?request.payload.proposalId:null;await tx.editorRewriteProposal.updateMany({where:{subtitleDocumentId:id,subtitleCueId:{in:affected},status:'PENDING',...(acceptedProposalId?{NOT:{id:acceptedProposalId}}:{})},data:{status:'SUPERSEDED'}});if(acceptedProposalId){const accepted=await tx.editorRewriteProposal.updateMany({where:{id:acceptedProposalId,status:'PENDING'},data:{status:'ACCEPTED',acceptedOperationId:operation.id}});if(!accepted.count)throw new AppError('REWRITE_PROPOSAL_DECIDED','Rewrite proposal was already decided.',409);}
      return{operation,payload:after};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:30000}).catch(rethrowEditorTransaction);
    return this.operationResult(id,result.operation.id,result.operation.type,result.payload.cues.map(cue=>cue.id));
  }

  private async historyAction(rawId:string,input:unknown,kind:'UNDO'|'REDO'){
    const id=idSchema.parse(rawId);const request=editorRevisionRequestSchema.parse(input);
    const result=await this.db.$transaction(async tx=>{
      if(request.clientOperationId){const existing=await tx.editorOperation.findUnique({where:{subtitleDocumentId_clientOperationId:{subtitleDocumentId:id,clientOperationId:request.clientOperationId}}});if(existing)return{operation:existing,payload:operationPayloadSchema.parse(existing.afterPayload)};}
      await tx.$queryRaw`SELECT id FROM "SubtitleDocument" WHERE id = ${id}::uuid FOR UPDATE`;const document=await tx.subtitleDocument.findUnique({where:{id},include:{mediaAsset:{select:{durationMs:true}}}});if(!document)throw new AppError('SUBTITLE_DOCUMENT_NOT_FOUND','Subtitle document not found.',404);if(document.revision!==request.baseRevision)throw new AppError('EDITOR_REVISION_CONFLICT','This subtitle document changed. Reload before undo or redo.',409);
      const history=await tx.editorOperation.findMany({where:{subtitleDocumentId:id},orderBy:{resultRevision:'asc'},select:{id:true,type:true,targetOperationId:true}});const targets=resolveHistoryTargets(history);const targetId=kind==='UNDO'?targets.undoOperationId:targets.redoOperationId;if(!targetId)throw new AppError(kind==='UNDO'?'NOTHING_TO_UNDO':'NOTHING_TO_REDO',kind==='UNDO'?'There is no editor operation to undo.':'There is no editor operation to redo.',409);const target=await tx.editorOperation.findUniqueOrThrow({where:{id:targetId}});const before=operationPayloadSchema.parse(kind==='UNDO'?target.afterPayload:target.beforePayload);const after=operationPayloadSchema.parse(kind==='UNDO'?target.beforePayload:target.afterPayload);await this.applyPayload(tx,document,after,document.mediaAsset.durationMs??0);const operation=await tx.editorOperation.create({data:{subtitleDocumentId:id,type:kind,baseRevision:document.revision,resultRevision:document.revision+1,beforePayload:json(before),afterPayload:json(after),targetOperationId:target.id,clientOperationId:request.clientOperationId}});await tx.subtitleDocument.update({where:{id},data:{revision:{increment:1}}});await tx.qCRun.updateMany({where:{status:'COMPLETED',documents:{some:{subtitleDocumentId:id}}},data:{status:'STALE',stage:'Document changed after QC'}});return{operation,payload:after};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:30000});return this.operationResult(id,result.operation.id,result.operation.type,result.payload.cues.map(cue=>cue.id));
  }
  undo(id:string,input:unknown){return this.historyAction(id,input,'UNDO');}redo(id:string,input:unknown){return this.historyAction(id,input,'REDO');}

  private async operationResult(documentId:string,operationId:string,type:string,cueIds:string[]){const document=await this.documentRow(documentId);const [rows,timings,operations]=await Promise.all([this.db.subtitleCue.findMany({where:{id:{in:cueIds}},include:cueInclude}),this.db.subtitleCue.findMany({where:{subtitleDocumentId:documentId,deletedAt:null},select:{id:true,startMs:true,endMs:true}}),this.db.editorOperation.findMany({where:{subtitleDocumentId:documentId},orderBy:{resultRevision:'asc'},select:{id:true,type:true,targetOperationId:true}})]);const history=resolveHistoryTargets(operations);return{documentRevision:document.revision,operationId,type,cues:rows.map(row=>toCue(row,timings,document.mediaAsset.durationMs??0)),history:{canUndo:history.undoOperationId!==null,canRedo:history.redoOperationId!==null,...history}};}

  async ensureEditorMedia(rawId:string){const id=idSchema.parse(rawId);const document=await this.documentRow(id);const settings=this.preparationSettings(document);const direct=directPlaybackMime(document.mediaAsset);if(!direct)await this.ensurePreparation(document.mediaAssetId,document.episodeId,'EDITOR_PROXY',settings.proxy);if(settings.waveform)await this.ensurePreparation(document.mediaAssetId,document.episodeId,'WAVEFORM',settings.waveform);return this.detail(id);}
  async ensureAssetWaveform(rawMediaAssetId:string,expectedEpisodeId:string){const mediaAssetId=idSchema.parse(rawMediaAssetId);const episodeId=idSchema.parse(expectedEpisodeId);const asset=await this.db.mediaAsset.findFirst({where:{id:mediaAssetId,episodeId},include:{streams:{orderBy:{streamIndex:'asc'}}}});if(!asset)throw new AppError('MEDIA_ASSET_OWNERSHIP','Media asset does not belong to this episode.',409);if(asset.status!=='READY')throw new AppError('MEDIA_ASSET_NOT_READY','Inspect the asset before preparing its waveform.',409);const settings=this.waveformSettings(asset.streams);if(!settings)throw new AppError('WAVEFORM_NOT_AVAILABLE','The project asset has no audio stream.',409);return this.ensurePreparation(asset.id,episodeId,'WAVEFORM',settings);}
  private async ensurePreparation(mediaAssetId:string,episodeId:string,kind:'EDITOR_PROXY'|'WAVEFORM',settings:Record<string,unknown>){const settingsHash=hash(settings);return this.db.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${mediaAssetId}:${kind}:${settingsHash}`}))`;const existing=await tx.editorMediaPreparation.findUnique({where:{mediaAssetId_kind_settingsHash:{mediaAssetId,kind,settingsHash}}});if(existing){if(existing.status==='FAILED'||existing.status==='CANCELLED'){const job=await tx.processingJob.create({data:{jobType:kind==='EDITOR_PROXY'?'GENERATE_EDITOR_PROXY':'GENERATE_WAVEFORM',episodeId,mediaAssetId}});return tx.editorMediaPreparation.update({where:{id:existing.id},data:{processingJobId:job.id,status:'QUEUED',stage:'Queued',derivativeId:null,startedAt:null,completedAt:null}});}return existing;}const job=await tx.processingJob.create({data:{jobType:kind==='EDITOR_PROXY'?'GENERATE_EDITOR_PROXY':'GENERATE_WAVEFORM',episodeId,mediaAssetId}});return tx.editorMediaPreparation.create({data:{mediaAssetId,kind,settings:json(settings),settingsHash,processingJobId:job.id,stage:'Queued'}});});}

  async cancelEditorMedia(rawId:string,input:unknown){
    const id=idSchema.parse(rawId);const request=editorPreparationRequestSchema.parse(input);const document=await this.documentRow(id);const settings=this.preparationSettings(document);const settingsHash=request.kind==='EDITOR_PROXY'?settings.proxyHash:settings.waveformHash;if(!settingsHash)throw new AppError('EDITOR_MEDIA_NOT_AVAILABLE','The selected editor media preparation is not available.',404);
    await this.db.$transaction(async tx=>{const preparation=await tx.editorMediaPreparation.findUnique({where:{mediaAssetId_kind_settingsHash:{mediaAssetId:document.mediaAssetId,kind:request.kind,settingsHash}}});if(!preparation)throw new AppError('EDITOR_MEDIA_NOT_FOUND','Editor media preparation not found.',404);const changed=await tx.processingJob.updateMany({where:{id:preparation.processingJobId,status:{in:['QUEUED','PROCESSING']}},data:{status:'CANCELLED',errorCode:'CANCELLED',errorMessage:'Cancelled by user.',completedAt:new Date()}});if(changed.count)await tx.editorMediaPreparation.update({where:{id:preparation.id},data:{status:'CANCELLED',stage:'Cancelled',completedAt:new Date()}});});return this.detail(id);
  }

  async resolvePlayback(rawId:string){const id=idSchema.parse(rawId);const document=await this.documentRow(id);const direct=directPlaybackMime(document.mediaAsset);if(direct)return{storageKey:(await this.db.mediaAsset.findUniqueOrThrow({where:{id:document.mediaAssetId},select:{storageKey:true}})).storageKey,sizeBytes:(await this.db.mediaAsset.findUniqueOrThrow({where:{id:document.mediaAssetId},select:{sizeBytes:true}})).sizeBytes,mimeType:direct};const settings=this.preparationSettings(document);const preparation=await this.db.editorMediaPreparation.findUnique({where:{mediaAssetId_kind_settingsHash:{mediaAssetId:document.mediaAssetId,kind:'EDITOR_PROXY',settingsHash:settings.proxyHash}},include:{derivative:true}});if(preparation?.status!=='COMPLETED'||!preparation.derivative)throw new AppError('EDITOR_PROXY_NOT_READY','Editor preview is still being prepared.',409);return{storageKey:preparation.derivative.storageKey,sizeBytes:preparation.derivative.sizeBytes,mimeType:'video/mp4'};}
  async waveform(rawId:string){const id=idSchema.parse(rawId);const document=await this.documentRow(id);const settings=this.preparationSettings(document);if(!settings.waveformHash)throw new AppError('WAVEFORM_NOT_READY','The media asset has no selected audio stream.',409);const preparation=await this.db.editorMediaPreparation.findUnique({where:{mediaAssetId_kind_settingsHash:{mediaAssetId:document.mediaAssetId,kind:'WAVEFORM',settingsHash:settings.waveformHash}},include:{derivative:true}});if(preparation?.status!=='COMPLETED'||!preparation.derivative)throw new AppError('WAVEFORM_NOT_READY','Waveform is still being prepared.',409);if(preparation.derivative.sizeBytes>16n*1024n*1024n)throw new AppError('WAVEFORM_TOO_LARGE','Stored waveform exceeds the editor response limit.',500);const lease=await this.storage.materialize(preparation.derivative.storageKey);try{return waveformSchema.parse(JSON.parse(await readFile(lease.path,'utf8')));}finally{await lease.release();}}
  async waveformForAsset(rawMediaAssetId:string,expectedEpisodeId:string){const mediaAssetId=idSchema.parse(rawMediaAssetId);const episodeId=idSchema.parse(expectedEpisodeId);const asset=await this.db.mediaAsset.findFirst({where:{id:mediaAssetId,episodeId},include:{streams:{orderBy:{streamIndex:'asc'}}}});if(!asset)throw new AppError('MEDIA_ASSET_OWNERSHIP','Media asset does not belong to this episode.',409);const settings=this.waveformSettings(asset.streams);if(!settings)throw new AppError('WAVEFORM_NOT_AVAILABLE','The project asset has no audio stream.',409);const preparation=await this.db.editorMediaPreparation.findUnique({where:{mediaAssetId_kind_settingsHash:{mediaAssetId,kind:'WAVEFORM',settingsHash:hash(settings)}},include:{derivative:true}});if(preparation?.status!=='COMPLETED'||!preparation.derivative)throw new AppError('WAVEFORM_NOT_READY','Waveform is still being prepared.',409);if(preparation.derivative.sizeBytes>16n*1024n*1024n)throw new AppError('WAVEFORM_TOO_LARGE','Stored waveform exceeds the editor response limit.',500);const lease=await this.storage.materialize(preparation.derivative.storageKey);try{return waveformSchema.parse(JSON.parse(await readFile(lease.path,'utf8')));}finally{await lease.release();}}

  providerReadiness(){return this.localizationProvider.readiness();}
}
