import {createHash,randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {loadConfig} from '../packages/config/src/index';
import {PrismaClient,type Prisma} from '../packages/database/src/index';
import type {TranslationProvider} from '../packages/localization/src/index';
import {LocalStorage} from '../packages/storage/src/index';
import {EditorService} from '../apps/api/src/editor.service';

const config=loadConfig();const db=new PrismaClient({datasourceUrl:config.DATABASE_URL});const count=1200;
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const provider:TranslationProvider={readiness:()=>({status:'UNAVAILABLE',message:'Benchmark does not call a provider.',provider:'none',model:'none'}),localize:async()=>{throw new Error('Provider must not be called by editor benchmark.');}};
const editor=new EditorService(db,new LocalStorage(config.STORAGE_ROOT),config,provider);
const series=await db.series.create({data:{title:'Owned Phase 05 editor benchmark'}});
try{
  const episode=await db.episode.create({data:{seriesId:series.id,title:'Synthetic 60 minute editor benchmark'}});
  const media=await db.mediaAsset.create({data:{episodeId:episode.id,originalFilename:'synthetic-browser-safe.mp4',storageKey:randomUUID(),mimeType:'video/mp4',containerFormat:'mov,mp4,m4a,3gp,3g2,mj2',sizeBytes:1n,durationMs:3_600_000,status:'READY'}});
  const fusionJob=await db.processingJob.create({data:{episodeId:episode.id,mediaAssetId:media.id,jobType:'FUSE_TRANSCRIPT',status:'COMPLETED',progress:100,completedAt:new Date()}});
  const fusion=await db.fusionRun.create({data:{episodeId:episode.id,mediaAssetId:media.id,requestedLanguage:'ENGLISH',canonicalLanguage:'en',languageReason:'Synthetic benchmark.',status:'COMPLETED',algorithmVersion:'fusion-v1',settings:{},identityHash:randomUUID(),coverageMetrics:{},processingJobId:fusionJob.id,completedAt:new Date()}});
  await db.transcriptSegment.createMany({data:Array.from({length:count},(_,sequence)=>({fusionRunId:fusion.id,sequence,startMs:sequence*3000,endMs:sequence*3000+1800,text:`Synthetic line ${sequence}.`,derivedStartMs:sequence*3000,derivedEndMs:sequence*3000+1800,derivedText:`Synthetic line ${sequence}.`,language:'en',confidence:.94,reviewCategory:'HIGH_CONFIDENCE',reviewStatus:'UNREVIEWED',derivationType:'DIRECT',confidenceReasons:{}}))});
  const transcripts=await db.transcriptSegment.findMany({where:{fusionRunId:fusion.id},orderBy:{sequence:'asc'}});const localizeJob=await db.processingJob.create({data:{episodeId:episode.id,jobType:'LOCALIZE_TRANSCRIPT',status:'COMPLETED',progress:100,completedAt:new Date()}});const localization=await db.localizationRun.create({data:{episodeId:episode.id,fusionRunId:fusion.id,sourceLanguage:'en',targetLanguage:'mn',mode:'NATURAL',provider:'deterministic-benchmark',model:'fixture-v1',promptVersion:'localization-prompt-v1',pipelineVersion:'localization-pipeline-v1',settings:{},contextSnapshot:{},sourceSnapshotHash:digest('synthetic-source'),identityHash:digest(randomUUID()),processingJobId:localizeJob.id,status:'COMPLETED',stage:'Completed',segmentCount:count,completedSegmentCount:count,batchCount:40,completedBatchCount:40,completedAt:new Date()}});
  await db.localizedSegment.createMany({data:transcripts.map(row=>({localizationRunId:localization.id,fusionRunId:fusion.id,transcriptSegmentId:row.id,sequence:row.sequence,sourceTextSnapshot:row.text,sourceStartMs:row.startMs,sourceEndMs:row.endMs,sourceConfidence:row.confidence,sourceReviewCategory:row.reviewCategory,sourceReviewStatus:row.reviewStatus,sourceEditRevision:0,machineDraft:`Монгол мөр ${row.sequence}.`,currentText:`Монгол мөр ${row.sequence}.`,confidence:.94,confidenceReasons:[] as Prisma.InputJsonValue,reviewClassification:'HIGH_CONFIDENCE',editState:'AI_GENERATED'}))});
  const initializeStarted=performance.now();const detail=await editor.createDocument(localization.id,{name:'Benchmark subtitles',initializationKey:randomUUID()});const initializationMs=Math.round(performance.now()-initializeStarted);const document=detail.document;
  const queryStarted=performance.now();const page=await editor.listCues(document.id,{offset:450,limit:300,filter:'ALL'});const pagedQueryMs=Math.round(performance.now()-queryStarted);
  const updateStarted=performance.now();const result=await editor.operate(document.id,{type:'UPDATE_TEXT',baseRevision:document.revision,clientOperationId:randomUUID(),payload:{cueId:page.items[0]!.id,text:'Гараар зассан туршилтын мөр.'}});const operationMs=Math.round(performance.now()-updateStarted);
  const persisted=await db.subtitleCue.count({where:{subtitleDocumentId:document.id,deletedAt:null}});if(persisted!==count||page.items.length!==300||result.documentRevision!==1)throw new Error('Editor benchmark invariant failed.');
  const measurement={kind:'synthetic-postgresql-editor',episodeDurationMinutes:60,segmentCount:count,initializationMs,pagedQueryMs,operationMs,renderedDomRows:'bounded by web virtualization',note:'Local PostgreSQL timing; no provider, browser paint, video decode, or network throughput is represented.'};await mkdir('data',{recursive:true});await writeFile('data/phase05-editor-benchmark.json',JSON.stringify(measurement,null,2));console.info(JSON.stringify({event:'editor_benchmark_passed',...measurement}));
}finally{await db.series.delete({where:{id:series.id}}).catch(()=>{});await db.$disconnect();}
