import {performance} from 'node:perf_hooks';
import type {PrismaClient,Prisma} from '@mongolsub/database';
import {AppError,errorDiagnostics} from '@mongolsub/domain';
import {localizationReasonSchema,localizationSettingsSchema} from '@mongolsub/contracts';
import {
  assessLocalization,assertLocalizationRequestBudget,buildContextBatches,localizationSnapshotSchema,localizationSourceSchema,translationSegmentSchema,validateTargetIds,
  LOCALIZATION_PIPELINE_VERSION,LOCALIZATION_PROMPT_VERSION,
  type LocalizationSnapshot,type LocalizationSource,type TranslationProvider,type TranslationUsage,
} from '@mongolsub/localization';

const json=<T>(value:T)=>value as Prisma.InputJsonValue;
const safeMessage='Localization could not complete. Review provider readiness and retry the failed run.';
function usage(value:Prisma.JsonValue|null):TranslationUsage {
  if(!value||typeof value!=='object'||Array.isArray(value))return {inputTokens:null,outputTokens:null,cachedTokens:null};
  const row=value as Record<string,unknown>;const count=(key:string)=>Number.isInteger(row[key])&&Number(row[key])>=0?Number(row[key]):null;
  return {inputTokens:count('inputTokens'),outputTokens:count('outputTokens'),cachedTokens:count('cachedTokens')};
}
function sumUsage(values:TranslationUsage[]):TranslationUsage {
  const sum=(key:keyof TranslationUsage)=>values.every(v=>v[key]!==null)?values.reduce((total,v)=>total+v[key]!,0):null;
  return {inputTokens:sum('inputTokens'),outputTokens:sum('outputTokens'),cachedTokens:sum('cachedTokens')};
}

export async function processLocalization(jobId:string,db:PrismaClient,provider:TranslationProvider):Promise<void>{
  const run=await db.localizationRun.findUniqueOrThrow({where:{processingJobId:jobId},include:{processingJob:true,batches:{orderBy:{batchIndex:'asc'}},segments:{orderBy:{sequence:'asc'}}}});
  if(['COMPLETED','FAILED','CANCELLED'].includes(run.processingJob.status))return;
  const started=Date.now();const startedAt=new Date(started);const abort=new AbortController();let polling=false;
  const timer=setInterval(()=>{if(polling)return;polling=true;void db.processingJob.findUnique({where:{id:jobId},select:{status:true}}).then(job=>{if(job?.status==='CANCELLED')abort.abort();}).catch(()=>{}).finally(()=>{polling=false;});},100);
  const check=()=>{if(abort.signal.aborted)throw new AppError('CANCELLED','Localization cancelled.');};
  const stage=async(label:string,progress:number)=>{check();await db.$transaction(async tx=>{const changed=await tx.processingJob.updateMany({where:{id:jobId,status:{in:['QUEUED','PROCESSING']}},data:{status:'PROCESSING',progress,startedAt:run.processingJob.startedAt??startedAt,errorCode:null,errorMessage:null}});if(!changed.count)throw new AppError('CANCELLED','Localization cancelled.');await tx.localizationRun.update({where:{id:run.id},data:{status:'PROCESSING',stage:label,startedAt:run.startedAt??startedAt}});});};
  try{
    if(run.promptVersion!==LOCALIZATION_PROMPT_VERSION||run.pipelineVersion!==LOCALIZATION_PIPELINE_VERSION)throw new AppError('LOCALIZATION_PIPELINE_UNAVAILABLE','This worker does not implement the requested localization pipeline version.');
    const readiness=provider.readiness();if(readiness.status!=='READY'||readiness.provider!==run.provider||readiness.model!==run.model)throw new AppError('LOCALIZATION_PROVIDER_CHANGED','The configured provider or model no longer matches this historical run.');
    await stage('Preparing context',3);
    const settings=localizationSettingsSchema.parse(run.settings);const snapshot=localizationSnapshotSchema.parse(run.contextSnapshot) as LocalizationSnapshot;
    const sources:LocalizationSource[]=run.segments.map(s=>localizationSourceSchema.parse({id:s.transcriptSegmentId,sequence:s.sequence,text:s.sourceTextSnapshot,startMs:s.sourceStartMs,endMs:s.sourceEndMs,speaker:s.sourceSpeaker,confidence:s.sourceConfidence,reviewCategory:s.sourceReviewCategory,reviewStatus:s.sourceReviewStatus,editRevision:s.sourceEditRevision}));
    const built=buildContextBatches(sources,snapshot,settings);
    if(built.length!==run.batches.length)throw new AppError('LOCALIZATION_SNAPSHOT_INVALID','Persisted localization batches no longer match their immutable snapshot.');
    let providerVersion=run.providerVersion;
    for(let index=0;index<run.batches.length;index++){
      const persisted=run.batches[index]!;const batch=built[index]!;if(persisted.status==='COMPLETED')continue;
      const targetIds=Array.isArray(persisted.targetSegmentIds)?persisted.targetSegmentIds.filter((id):id is string=>typeof id==='string'):[];
      if(targetIds.length!==batch.targets.length||targetIds.some((id,i)=>id!==batch.targets[i]?.id))throw new AppError('LOCALIZATION_SNAPSHOT_INVALID','Persisted batch target identifiers do not match their immutable source snapshot.');
      const batchStarted=performance.now();const progress=5+Math.floor(index/Math.max(1,run.batches.length)*88);
      await stage(`Translating batch ${index+1} / ${run.batches.length}`,progress);
      await db.localizationBatch.update({where:{id:persisted.id},data:{status:'PROCESSING',errorCode:null}});
      let drafts;
      if(persisted.draftResults){drafts=validateTargetIds(targetIds,translationSegmentSchema.array().parse(persisted.draftResults));}
      else {const draftInput={phase:'DRAFT' as const,mode:run.mode,sourceLanguage:run.sourceLanguage as 'en'|'zh',batch};assertLocalizationRequestBudget(draftInput,settings.maxProviderRequestCharacters);const draft=await provider.localize(draftInput,abort.signal);check();drafts=validateTargetIds(targetIds,draft.segments);providerVersion=draft.providerVersion??providerVersion;await db.localizationBatch.update({where:{id:persisted.id},data:{draftResults:json(drafts),draftUsage:json(draft.usage)}});}
      check();await stage(`Checking fidelity ${index+1} / ${run.batches.length}`,Math.min(94,progress+2));
      const reviewInput={phase:'REVIEW' as const,mode:run.mode,sourceLanguage:run.sourceLanguage as 'en'|'zh',batch,drafts};assertLocalizationRequestBudget(reviewInput,settings.maxProviderRequestCharacters);const reviewed=await provider.localize(reviewInput,abort.signal);check();const finals=validateTargetIds(targetIds,reviewed.segments);providerVersion=reviewed.providerVersion??providerVersion;
      await db.$transaction(async tx=>{
        const locked=await tx.processingJob.updateMany({where:{id:jobId,status:'PROCESSING'},data:{progress:Math.min(95,progress+4)}});if(!locked.count)throw new AppError('CANCELLED','Localization cancelled before batch persistence.');
        for(let i=0;i<finals.length;i++){
          const final=finals[i]!;const source=batch.targets[i]!;const draft=drafts[i]!;const quality=assessLocalization(source,final,batch.glossary,batch.characters);const reasons=quality.confidenceReasons.map(reason=>localizationReasonSchema.parse(reason));
          const changed=await tx.localizedSegment.updateMany({where:{localizationRunId:run.id,transcriptSegmentId:source.id,currentText:null,editState:'PENDING'},data:{machineDraft:draft.translation,currentText:final.translation,providerConfidence:quality.providerConfidence,confidence:quality.confidence,confidenceReasons:json(reasons),reviewClassification:quality.reviewClassification,editState:final.translation===draft.translation?'AI_GENERATED':'AI_REVISED',characterCount:quality.characterCount,readingLoad:quality.readingLoad,alternativeTranslation:final.alternativeTranslation,suggestedLineBreak:final.suggestedLineBreak}});
          if(!changed.count)throw new AppError('LOCALIZATION_BATCH_CONFLICT','A localization target was already finalized outside its persisted batch.');
        }
        await tx.localizationBatch.update({where:{id:persisted.id},data:{status:'COMPLETED',reviewUsage:json(reviewed.usage),processingDurationMs:Math.round(performance.now()-batchStarted),errorCode:null}});
        await tx.localizationRun.update({where:{id:run.id},data:{completedBatchCount:{increment:1},completedSegmentCount:{increment:finals.length},providerVersion}});
      },{timeout:120000});
    }
    check();await stage('Finalizing localization',97);
    const [counts,batches]=await Promise.all([db.localizedSegment.groupBy({by:['reviewClassification'],where:{localizationRunId:run.id,currentText:{not:null}},_count:{_all:true}}),db.localizationBatch.findMany({where:{localizationRunId:run.id},select:{status:true,draftUsage:true,reviewUsage:true}})]);
    if(batches.some(batch=>batch.status!=='COMPLETED'))throw new AppError('LOCALIZATION_INCOMPLETE','Not every localization batch completed.');
    const allUsage=sumUsage(batches.flatMap(batch=>[usage(batch.draftUsage),usage(batch.reviewUsage)]));const count=(category:string)=>counts.find(row=>row.reviewClassification===category)?._count._all??0;
    await db.$transaction(async tx=>{const completedAt=new Date();const locked=await tx.processingJob.updateMany({where:{id:jobId,status:'PROCESSING'},data:{status:'COMPLETED',progress:100,completedAt,errorCode:null,errorMessage:null}});if(!locked.count)throw new AppError('CANCELLED','Localization cancelled before completion.');await tx.localizationRun.update({where:{id:run.id},data:{status:'COMPLETED',stage:'Completed',providerVersion,completedSegmentCount:run.segmentCount,completedBatchCount:run.batchCount,highConfidenceCount:count('HIGH_CONFIDENCE'),reviewRecommendedCount:count('REVIEW_RECOMMENDED'),likelyProblemCount:count('LIKELY_PROBLEM'),inputTokens:allUsage.inputTokens,outputTokens:allUsage.outputTokens,cachedTokens:allUsage.cachedTokens,usageComplete:Object.values(allUsage).every(value=>value!==null),processingDurationMs:Date.now()-started,completedAt}});},{timeout:120000});
    console.info(JSON.stringify({event:'localization_completed',localizationRunId:run.id,episodeId:run.episodeId,fusionRunId:run.fusionRunId,sourceLanguage:run.sourceLanguage,targetLanguage:'mn',mode:run.mode,provider:run.provider,model:run.model,batchCount:run.batchCount,segmentCount:run.segmentCount,highConfidenceCount:count('HIGH_CONFIDENCE'),reviewRecommendedCount:count('REVIEW_RECOMMENDED'),likelyProblemCount:count('LIKELY_PROBLEM'),durationMs:Date.now()-started}));
  }catch(error){const failure=error instanceof AppError?error:new AppError('LOCALIZATION_FAILED',safeMessage);await failLocalization(jobId,db,failure.code,failure.code==='CANCELLED'?'Localization cancelled.':safeMessage);console.error(JSON.stringify({event:'localization_failed',localizationRunId:run.id,episodeId:run.episodeId,code:failure.code,diagnostics:errorDiagnostics(error)}));if(failure.code!=='CANCELLED')throw failure;
  }finally{clearInterval(timer);}
}

export async function failLocalization(jobId:string,db:PrismaClient,code:string,message:string):Promise<void>{await db.$transaction(async tx=>{const status=code==='CANCELLED'?'CANCELLED':'FAILED';const job=await tx.processingJob.updateMany({where:{id:jobId,status:{in:['QUEUED','PROCESSING']}},data:{status,errorCode:code,errorMessage:message,completedAt:new Date()}});if(job.count){await tx.localizationRun.updateMany({where:{processingJobId:jobId},data:{status,stage:status==='CANCELLED'?'Cancelled':'Failed',completedAt:new Date()}});await tx.localizationBatch.updateMany({where:{localizationRun:{processingJobId:jobId},status:'PROCESSING'},data:{status,errorCode:code}});}});}
