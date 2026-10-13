import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {PrismaClient,type Prisma} from '../packages/database/src/index';
import {FusionService} from '../apps/api/src/fusion.service';
import {processFusion} from '../apps/worker/src/fusion';
// Run with other MongolSub workers stopped. Creates/deletes only owned synthetic
// evidence; uses real PostgreSQL transactions, never models, media or Redis flush.
const db=new PrismaClient();const measurements=[];
const series=await db.series.create({data:{title:'Owned Phase03 persistence benchmark'}});
try {
  for(const [durationMs,count] of [[2700000,500],[3600000,1200]] as const){
    const episode=await db.episode.create({data:{seriesId:series.id,title:`Synthetic ${count} cues`,sourceLanguage:'en'}});
    const asset=await db.mediaAsset.create({data:{episodeId:episode.id,originalFilename:'benchmark-evidence.mkv',storageKey:randomUUID(),mimeType:'video/x-matroska',sizeBytes:1n,durationMs,status:'READY'}});
    const ids=[];
    for(const method of ['EMBEDDED_SUBTITLE','ASR','OCR'] as const){
      const job=await db.processingJob.create({data:{episodeId:episode.id,mediaAssetId:asset.id,status:'COMPLETED',jobType:method==='ASR'?'TRANSCRIBE_AUDIO':method==='OCR'?'OCR_BURNED_SUBTITLE':'EXTRACT_EMBEDDED_SUBTITLE'}});
      const settings=method==='OCR'?{method,language:'en',fps:4,region:'BOTTOM_REGION',bottomFraction:0.4,minimumConfidence:0.5}:method==='ASR'?{method,language:'en',streamIndex:1,align:false,diarize:false}:{method,language:'en',streamIndex:2};
      const input=await db.sourceExtractionRun.create({data:{episodeId:episode.id,mediaAssetId:asset.id,method,provider:method==='ASR'?'whisperx':method==='OCR'?'paddleocr':'ffmpeg',providerVersion:'synthetic-benchmark-1',modelVersion:method==='EMBEDDED_SUBTITLE'?null:'synthetic-benchmark',streamIndex:method==='OCR'?null:method==='ASR'?1:2,languageRequested:'en',status:'COMPLETED',settings,settingsHash:randomUUID(),identityHash:randomUUID(),processingJobId:job.id}});ids.push(input.id);
      const rows=Array.from({length:count},(_,sequence)=>{const startMs=Math.round(sequence*durationMs/count)+(method==='ASR'?80:0);const text=`Synthetic dialogue line ${sequence}.`;const providerMetadata=method==='ASR'?{provider:'whisperx',model:'synthetic-benchmark',warnings:[]}:method==='OCR'?{provider:'paddleocr',model:'synthetic-benchmark',representativeTimestampMs:startMs,rawText:text,box:null,observationCount:4}:{provider:'ffmpeg',codec:'subrip',trackLanguage:'en'};return {extractionRunId:input.id,sequence,startMs,endMs:startMs+1600,text,language:'en',confidence:method==='OCR'?0.93:null,words:[],providerMetadata} satisfies Prisma.SourceSegmentCreateManyInput;});
      for(let offset=0;offset<rows.length;offset+=200)await db.sourceSegment.createMany({data:rows.slice(offset,offset+200)});
    }
    for(let repeat=0;repeat<3;repeat++){
      const run=await new FusionService(db).create(episode.id,{mediaAssetId:asset.id,inputRunIds:ids,language:'ENGLISH',rerunKey:randomUUID()});const start=performance.now();await processFusion(run.processingJobId,db);const result=await db.fusionRun.findUniqueOrThrow({where:{id:run.id}});const totalMs=performance.now()-start;
      if(result.status!=='COMPLETED'||await db.transcriptSegment.count({where:{fusionRunId:run.id}})!==count)throw Error('Persistence benchmark failed its canonical count assertion.');
      measurements.push({durationMs,segmentsPerMethod:count,totalSourceSegments:count*3,repeat,alignmentMs:result.alignmentDurationMs,reconciliationMs:result.reconciliationDurationMs,persistenceMs:result.persistenceDurationMs,workerWallMs:Number(totalMs.toFixed(2))});
    }
  }
  await mkdir('data',{recursive:true});await writeFile('data/phase03-persistence-benchmark.json',JSON.stringify(measurements,null,2));console.info(JSON.stringify({event:'fusion_persistence_benchmark_passed',measurements}));
}finally{await db.series.delete({where:{id:series.id}});await db.$disconnect();}
