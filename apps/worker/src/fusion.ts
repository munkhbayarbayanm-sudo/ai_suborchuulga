import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {Prisma,type PrismaClient} from '@mongolsub/database';
import {AppError,errorDiagnostics} from '@mongolsub/domain';
import {canonicalLanguageSchema,confidenceReasonsSchema,coverageMetricsSchema,fusionSettingsSchema,segmentEvidenceSchema} from '@mongolsub/contracts';
import {ALGORITHM_VERSION,fuseTranscript,type FusionInput} from '@mongolsub/fusion';
export async function processFusion(jobId:string,db:PrismaClient):Promise<void>{
  const run=await db.fusionRun.findUniqueOrThrow({where:{processingJobId:jobId},include:{processingJob:true,mediaAsset:true,inputs:{include:{sourceExtractionRun:{include:{segments:{orderBy:[{startMs:'asc'},{sequence:'asc'}]}}}},orderBy:{sourceExtractionRunId:'asc'}}}});
  if(['COMPLETED','FAILED','CANCELLED'].includes(run.processingJob.status))return;
  const started=Date.now();const startedAt=new Date(started);let cancelled=false;let polling=false;
  const timer=setInterval(()=>{if(polling)return;polling=true;void db.processingJob.findUnique({where:{id:jobId}}).then(job=>{if(job?.status==='CANCELLED')cancelled=true;}).catch(()=>{}).finally(()=>{polling=false;});},100);
  function check(){if(cancelled)throw new AppError('CANCELLED','Transcript fusion cancelled.');}
  async function stage(label:string,progress:number){check();await db.$transaction(async tx=>{const updated=await tx.processingJob.updateMany({where:{id:jobId,status:{in:['QUEUED','PROCESSING']}},data:{status:'PROCESSING',progress,startedAt:run.processingJob.startedAt??startedAt}});if(!updated.count)throw new AppError('CANCELLED','Transcript fusion cancelled.');await tx.fusionRun.update({where:{id:run.id},data:{status:'PROCESSING',stage:label,startedAt:run.startedAt??startedAt}});});}
  try{
    await stage('Loading evidence',5);
    if(run.algorithmVersion!==ALGORITHM_VERSION)throw new AppError('ALGORITHM_UNAVAILABLE','This worker does not implement the requested fusion algorithm version.');
    if(run.inputs.some(input=>input.sourceExtractionRun.status!=='COMPLETED'))throw new AppError('INVALID_FUSION_INPUT','All selected extraction runs must remain completed.');
    const settings=fusionSettingsSchema.parse(run.settings);const canonicalLanguage=canonicalLanguageSchema.parse(run.canonicalLanguage);
    const inputs:FusionInput[]=run.inputs.map(({sourceExtractionRun:source})=>({id:source.id,method:source.method,segments:source.segments.map(segment=>({...segmentEvidenceSchema.parse(segment),id:segment.id,extractionRunId:source.id,sequence:segment.sequence}))}));
    const result=await fuseTranscript(inputs,settings,canonicalLanguage,run.mediaAsset.durationMs,{stage,check});
    const metrics=coverageMetricsSchema.parse(result.metrics);
    check();await stage('Persisting transcript',90);
    const persistenceStarted=performance.now();
    await db.$transaction(async tx=>{
      const updated=await tx.processingJob.updateMany({where:{id:jobId,status:'PROCESSING'},data:{status:'COMPLETED',progress:100,completedAt:new Date(),errorCode:null,errorMessage:null}});if(!updated.count)throw new AppError('CANCELLED','Fusion cancelled before final persistence.');
      // Every canonical row and link commits together; source evidence is read-only.
      const rows=result.segments.map((segment,sequence)=>({id:randomUUID(),fusionRunId:run.id,sequence,startMs:segment.startMs,endMs:segment.endMs,text:segment.text,derivedStartMs:segment.startMs,derivedEndMs:segment.endMs,derivedText:segment.text,language:segment.language,speaker:segment.speaker,confidence:segment.confidence,reviewCategory:segment.reviewCategory,derivationType:segment.derivationType,confidenceReasons:confidenceReasonsSchema.parse(segment.confidenceReasons)} satisfies Prisma.TranscriptSegmentCreateManyInput));
      for(let offset=0;offset<rows.length;offset+=200)await tx.transcriptSegment.createMany({data:rows.slice(offset,offset+200)});
      const links=result.segments.flatMap((segment,index)=>segment.evidence.map(evidence=>({transcriptSegmentId:rows[index]!.id,fusionRunId:run.id,...evidence} satisfies Prisma.TranscriptEvidenceLinkCreateManyInput)));
      for(let offset=0;offset<links.length;offset+=500)await tx.transcriptEvidenceLink.createMany({data:links.slice(offset,offset+500)});
      await tx.fusionRun.update({where:{id:run.id},data:{status:'COMPLETED',stage:'Completed',overallConfidence:result.overallConfidence,coverageMetrics:metrics,alignmentDurationMs:Math.round(result.timings.alignmentMs),reconciliationDurationMs:Math.round(result.timings.reconciliationMs),persistenceDurationMs:Math.round(performance.now()-persistenceStarted),processingDurationMs:Date.now()-started,completedAt:new Date()}});
    },{timeout:120000});
    console.info(JSON.stringify({event:'fusion_completed',fusionRunId:run.id,episodeId:run.episodeId,canonicalLanguage,inputRunIds:run.inputs.map(input=>input.sourceExtractionRunId),inputSegmentCount:metrics.inputSegmentCount,segmentCount:metrics.canonicalSegmentCount,conflictCount:metrics.conflictingSegments,reviewCount:metrics.reviewRecommendedCount,likelyProblemCount:metrics.likelyProblemCount,alignmentDurationMs:Math.round(result.timings.alignmentMs),reconciliationDurationMs:Math.round(result.timings.reconciliationMs),persistenceDurationMs:Math.round(performance.now()-persistenceStarted),durationMs:Date.now()-started}));
  }catch(error){const failure=error instanceof AppError?error:new AppError('FUSION_FAILED','Transcript fusion could not complete. Check worker and database readiness.');await failFusion(jobId,db,failure.code,failure.message);console.error(JSON.stringify({event:'fusion_failed',fusionRunId:run.id,episodeId:run.episodeId,code:failure.code,diagnostics:errorDiagnostics(error)}));if(failure.code!=='CANCELLED')throw failure;
  }finally{clearInterval(timer);}
}
export async function failFusion(jobId:string,db:PrismaClient,code:string,message:string):Promise<void>{await db.$transaction(async tx=>{const status=code==='CANCELLED'?'CANCELLED':'FAILED';const updated=await tx.processingJob.updateMany({where:{id:jobId,status:{in:['QUEUED','PROCESSING']}},data:{status,errorCode:code,errorMessage:message,completedAt:new Date()}});if(updated.count)await tx.fusionRun.updateMany({where:{processingJobId:jobId},data:{status,stage:status==='CANCELLED'?'Cancelled':'Failed',completedAt:new Date()}});});}
