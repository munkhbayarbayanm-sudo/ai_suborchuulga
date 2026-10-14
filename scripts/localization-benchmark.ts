import {createHash,randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {mkdir,writeFile} from 'node:fs/promises';
import {PrismaClient,type Prisma} from '../packages/database/src/index';
import {loadConfig} from '../packages/config/src/index';
import {localizationSettingsSchema} from '../packages/contracts/src/index';
import {buildContextBatches,type LocalizationSnapshot,type LocalizationSource,type TranslationInput,type TranslationProvider} from '../packages/localization/src/index';
import {processLocalization} from '../apps/worker/src/localization';

const config=loadConfig();
const db=new PrismaClient({datasourceUrl:config.DATABASE_URL});
const count=900;
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const settings=localizationSettingsSchema.parse({batchSize:30,contextBefore:5,contextAfter:5});
const provider:TranslationProvider={
  readiness:()=>({status:'READY',message:'Deterministic benchmark provider.',provider:'deterministic-benchmark',model:'fixture-v1'}),
  localize:async(input:TranslationInput)=>({model:'fixture-v1',providerVersion:'fixture-v1',usage:{inputTokens:null,outputTokens:null,cachedTokens:null},segments:input.batch.targets.map(target=>({segmentId:target.id,translation:`Туршилтын мөр ${target.sequence}.`,providerConfidence:0.95,issues:[],alternativeTranslation:null,suggestedLineBreak:null}))}),
};

const series=await db.series.create({data:{title:'Owned Phase 04 localization benchmark'}});
try {
  const episode=await db.episode.create({data:{seriesId:series.id,title:'Synthetic 60 minute benchmark',episodeNumber:1}});
  const media=await db.mediaAsset.create({data:{episodeId:episode.id,originalFilename:'synthetic-benchmark.mkv',storageKey:randomUUID(),mimeType:'video/x-matroska',sizeBytes:1n,durationMs:3_600_000,status:'READY'}});
  const fusionJob=await db.processingJob.create({data:{episodeId:episode.id,mediaAssetId:media.id,jobType:'FUSE_TRANSCRIPT',status:'COMPLETED',progress:100,completedAt:new Date()}});
  const fusion=await db.fusionRun.create({data:{episodeId:episode.id,mediaAssetId:media.id,requestedLanguage:'ENGLISH',canonicalLanguage:'en',languageReason:'Synthetic deterministic benchmark.',status:'COMPLETED',algorithmVersion:'fusion-v1',settings:{},identityHash:randomUUID(),coverageMetrics:{},processingJobId:fusionJob.id,completedAt:new Date()}});
  await db.transcriptSegment.createMany({data:Array.from({length:count},(_,sequence)=>({fusionRunId:fusion.id,sequence,startMs:sequence*4000,endMs:sequence*4000+2200,text:`Synthetic dialogue line ${sequence}.`,derivedStartMs:sequence*4000,derivedEndMs:sequence*4000+2200,derivedText:`Synthetic dialogue line ${sequence}.`,language:'en',confidence:0.94,reviewCategory:'HIGH_CONFIDENCE',reviewStatus:'UNREVIEWED',derivationType:'DIRECT',confidenceReasons:{}}))});
  const rows=await db.transcriptSegment.findMany({where:{fusionRunId:fusion.id},orderBy:{sequence:'asc'}});
  const sources:LocalizationSource[]=rows.map(row=>({id:row.id,sequence:row.sequence,text:row.text,startMs:row.startMs,endMs:row.endMs,speaker:null,confidence:row.confidence,reviewCategory:row.reviewCategory,reviewStatus:row.reviewStatus,editRevision:row.editRevision}));
  const snapshot:LocalizationSnapshot={seriesId:series.id,episodeId:episode.id,fusionRunId:fusion.id,sourceLanguage:'en',profile:{defaultMode:'NATURAL',generalTone:'',setting:'Modern synthetic benchmark',preferredStyle:'Natural spoken Mongolian',formalityGuidance:'',nameHandling:'',specialNotes:''},characters:[],relationships:[],glossary:[],translationMemory:[],previousApprovedLines:[]};
  const contextStarted=performance.now();
  const batches=buildContextBatches(sources,snapshot,settings);
  const contextBuildMs=Math.round(performance.now()-contextStarted);
  const persistenceStarted=performance.now();
  const job=await db.processingJob.create({data:{episodeId:episode.id,jobType:'LOCALIZE_TRANSCRIPT'}});
  const run=await db.localizationRun.create({data:{episodeId:episode.id,fusionRunId:fusion.id,sourceLanguage:'en',targetLanguage:'mn',mode:'NATURAL',provider:'deterministic-benchmark',model:'fixture-v1',promptVersion:'localization-prompt-v1',pipelineVersion:'localization-pipeline-v1',settings:settings as Prisma.InputJsonValue,contextSnapshot:snapshot as unknown as Prisma.InputJsonValue,sourceSnapshotHash:digest('synthetic-source'),identityHash:digest(randomUUID()),processingJobId:job.id,segmentCount:count,batchCount:batches.length}});
  await db.localizedSegment.createMany({data:sources.map(source=>({localizationRunId:run.id,fusionRunId:fusion.id,transcriptSegmentId:source.id,sequence:source.sequence,sourceTextSnapshot:source.text,sourceStartMs:source.startMs,sourceEndMs:source.endMs,sourceConfidence:source.confidence,sourceReviewCategory:source.reviewCategory,sourceReviewStatus:source.reviewStatus,sourceEditRevision:source.editRevision}))});
  await db.localizationBatch.createMany({data:batches.map((batch,batchIndex)=>({localizationRunId:run.id,batchIndex,targetSegmentIds:batch.targets.map(target=>target.id) as Prisma.InputJsonValue}))});
  const initialPersistenceMs=Math.round(performance.now()-persistenceStarted);
  const pipelineStarted=performance.now();
  await processLocalization(job.id,db,provider);
  const orchestrationAndPersistenceMs=Math.round(performance.now()-pipelineStarted);
  const completed=await db.localizationRun.findUniqueOrThrow({where:{id:run.id},select:{status:true,completedSegmentCount:true,batchCount:true,processingDurationMs:true}});
  if(completed.status!=='COMPLETED'||completed.completedSegmentCount!==count)throw new Error('Deterministic localization benchmark did not persist every segment.');
  const result={kind:'deterministic-fake-provider',segmentCount:count,batchCount:batches.length,contextBuildMs,initialPersistenceMs,orchestrationAndPersistenceMs,workerProcessingDurationMs:completed.processingDurationMs,providerNetworkCalls:0,note:'These measurements are local deterministic orchestration and PostgreSQL persistence, not real LLM throughput.'};
  await mkdir('data',{recursive:true});
  await writeFile('data/phase04-localization-benchmark.json',JSON.stringify(result,null,2));
  console.info(JSON.stringify({event:'localization_benchmark_passed',...result}));
} finally {
  await db.series.delete({where:{id:series.id}}).catch(()=>{});
  await db.$disconnect();
}
