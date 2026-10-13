import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp,readFile,readdir,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '../../packages/database/src/index';
import { loadConfig } from '../../packages/config/src/index';
import { createApi } from '../../apps/api/src/app';
import { createInspectionWorker } from '../../apps/worker/src/worker';
import { processSourceExtraction } from '../../apps/worker/src/extraction';
import { LocalStorage } from '../../packages/storage/src/index';
import { createSourceFixture } from '../../scripts/create-source-fixture';
import { extractSubtitle,prepareAudio,sampleFrames,type ProviderSet,parseAsrResult,parseOcrResult } from '../../packages/extraction/src/index';
import { extractionRunSchema,runPageSchema,segmentPageSchema,importResultSchema,seriesSchema,episodeSchema,jobSchema } from '../../packages/contracts/src/index';
import { parseProbe,runProcess } from '../../packages/media/src/index';
describe('Phase02 real HTTP/DB/queue/FFmpeg with deterministic provider fixtures',()=>{
  const original=loadConfig();const db=new PrismaClient({datasourceUrl:original.DATABASE_URL});
  let config=original;let root:string;let url:string;let app:Awaited<ReturnType<typeof createApi>>;let worker:Awaited<ReturnType<typeof createInspectionWorker>>;
  let seriesId:string;let episodeId:string;let assetId:string;let fixture:string;let englishRunId:string;
  let asrAvailable=true;let ocrAvailable=true;let slowAsr=false;let corruptAsr=false;let driftAsr=false;let asrCalls=0;let cancelCalls=0;
  const providers:ProviderSet={
    asr:{readiness:async()=>({provider:'whisperx',state:asrAvailable?'READY_CPU':'UNAVAILABLE',version:'fixture-1',model:'fixture',message:'CI fixture provider, not real WhisperX'}),cancel:async()=>{cancelCalls++;},transcribe:async(input,signal)=>{
      asrCalls++;
      if(slowAsr)await new Promise<void>((resolve,reject)=>{const timer=setTimeout(resolve,10000);signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(new Error('cancelled'));},{once:true});});
      return parseAsrResult({provider:'whisperx',providerVersion:'fixture-1',modelVersion:driftAsr?'changed-model':'fixture',languageDetected:null,device:'cpu',segments:[{startMs:corruptAsr?-1:200,endMs:1500,text:input.language==='zh'?'你好':'Hello',language:input.language??'en',confidence:null,speaker:null,words:[{text:input.language==='zh'?'你好':'Hello',startMs:200,endMs:1400,confidence:0.9,speaker:null}]}],warnings:[]});
    }},
    ocr:{readiness:async()=>({provider:'paddleocr',state:ocrAvailable?'READY_CPU':'UNAVAILABLE',version:'fixture-1',model:'PP-OCRv5-fixture',message:'CI fixture provider, not real PaddleOCR'}),cancel:async()=>{},recognize:async(input)=>parseOcrResult({provider:'paddleocr',providerVersion:'fixture-1',modelVersion:'PP-OCRv5-fixture',languageDetected:null,device:'cpu',observations:input.frames.map(frame=>({timestampMs:frame.timestampMs,text:frame.timestampMs<1000?'我不会走':'再见',confidence:0.96,box:[0.2,0.4,0.6,0.2]})),warnings:[]})}
  };
  beforeAll(async()=>{
    root=await mkdtemp(join(tmpdir(),'mongolsub-source-tests-'));config={...original,STORAGE_ROOT:join(root,'media'),MEDIA_WORK_ROOT:join(root,'work')};
    fixture=join(root,'sources.mkv');await createSourceFixture(fixture,config.FFMPEG_PATH);
    app=await createApi(config,providers);await app.listen(0,'127.0.0.1');url=await app.getUrl();
    worker=await createInspectionWorker(config,providers);
  });
  afterAll(async()=>{if(worker)await worker.close();if(app)await app.close();if(seriesId)await db.series.delete({where:{id:seriesId}});await db.$disconnect();if(root)await rm(root,{recursive:true,force:true});});
  async function json(path:string,value?:unknown){const response=await fetch(url+path,value===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});const body:unknown=await response.json();return{response,body};}
  async function wait(runId:string){for(let i=0;i<200;i++){const run=extractionRunSchema.parse((await json(`/source-extractions/${runId}`)).body);if(['COMPLETED','FAILED','CANCELLED'].includes(run.status))return run;await new Promise(resolve=>setTimeout(resolve,100));}throw new Error('Extraction did not complete');}
  it('imports and distinguishes all language/audio/subtitle tracks',async()=>{
    seriesId=seriesSchema.parse((await json('/series',{title:'Source integration',sourceLanguage:'en'})).body).id;
    episodeId=episodeSchema.parse((await json(`/series/${seriesId}/episodes`,{title:'Multilingual evidence'})).body).id;
    const form=new FormData();form.append('file',new Blob([new Uint8Array(await readFile(fixture))],{type:'video/x-matroska'}),'sources.mkv');
    const uploaded=importResultSchema.parse(await(await fetch(`${url}/episodes/${episodeId}/media`,{method:'POST',body:form})).json());assetId=uploaded.asset.id;
    let completed=false;for(let i=0;i<100;i++){if(jobSchema.parse((await json(`/jobs/${uploaded.job.id}`)).body).status==='COMPLETED'){completed=true;break;}await new Promise(resolve=>setTimeout(resolve,100));}expect(completed).toBe(true);
    const streams=await db.mediaStream.findMany({where:{mediaAssetId:assetId},orderBy:{streamIndex:'asc'}});
    expect(streams.map(s=>s.type)).toEqual(['VIDEO','AUDIO','AUDIO','SUBTITLE','SUBTITLE','SUBTITLE']);expect(streams[4]?.codec).toBe('ass');expect(streams[5]?.language).toBe('zh-Hant');
  });
  it('extracts exact English/Chinese streams independently, strips ASS tags and persists provenance',async()=>{
    const created=await json(`/episodes/${episodeId}/source-extractions/embedded`,{mediaAssetId:assetId,streamIndex:3});expect(created.response.status,JSON.stringify(created.body)).toBe(201);
    englishRunId=extractionRunSchema.parse(created.body).id;const english=await wait(englishRunId);expect(english.status).toBe('COMPLETED');expect(english.segmentCount).toBe(2);
    const page=segmentPageSchema.parse((await json(`/source-extractions/${english.id}/segments?limit=1`)).body);expect(page.total).toBe(2);expect(page.items[0]).toMatchObject({startMs:200,endMs:1400,text:'Hello, traveler.',language:'en',method:'EMBEDDED_SUBTITLE',streamIndex:3});
    const chinese=extractionRunSchema.parse((await json(`/episodes/${episodeId}/source-extractions/embedded`,{mediaAssetId:assetId,streamIndex:4})).body);expect((await wait(chinese.id)).status).toBe('COMPLETED');
    const segments=segmentPageSchema.parse((await json(`/source-extractions/${chinese.id}/segments`)).body);expect(segments.items[0]?.text).toBe('你竟敢背叛本王\n不要离开。');expect(segments.items[0]?.providerMetadata).toMatchObject({provider:'ffmpeg',codec:'ass',trackLanguage:'chi'});
    const traditional=extractionRunSchema.parse((await json(`/episodes/${episodeId}/source-extractions/embedded`,{mediaAssetId:assetId,streamIndex:5})).body);await wait(traditional.id);expect(segmentPageSchema.parse((await json(`/source-extractions/${traditional.id}/segments`)).body).items[0]).toMatchObject({text:'我不會離開你。',language:'zh-TW'});
  });
  it('deduplicates concurrent clicks, reuses explicit rerun request keys, and paginates deterministically',async()=>{
    const path=`/episodes/${episodeId}/source-extractions/embedded`;const input={mediaAssetId:assetId,streamIndex:3};
    const repeated=await Promise.all([json(path,input),json(path,input)]);expect(repeated.map(r=>extractionRunSchema.parse(r.body).id)).toEqual([englishRunId,englishRunId]);
    const rerunKey=randomUUID();const revision=await Promise.all([json(path,{...input,rerunKey}),json(path,{...input,rerunKey})]);const id=extractionRunSchema.parse(revision[0]?.body).id;expect(id).not.toBe(englishRunId);expect(extractionRunSchema.parse(revision[1]?.body).id).toBe(id);await wait(id);
    const page=segmentPageSchema.parse((await json(`/source-extractions/${englishRunId}/segments?offset=1&limit=1`)).body);expect(page.items[0]?.sequence).toBe(1);expect(page.items[0]?.startMs).toBe(1500);
    expect(runPageSchema.parse((await json(`/episodes/${episodeId}/source-extractions?limit=2`)).body).items).toHaveLength(2);
  });
  it('prepares the exact audio stream once, preserves fixture ASR words, keeps Chinese speech generic',async()=>{
    for(const language of ['en','zh']){const run=extractionRunSchema.parse((await json(`/episodes/${episodeId}/source-extractions/asr`,{mediaAssetId:assetId,streamIndex:2,language})).body);expect((await wait(run.id)).status).toBe('COMPLETED');const page=segmentPageSchema.parse((await json(`/source-extractions/${run.id}/segments`)).body);expect(page.items[0]?.words[0]).toMatchObject({startMs:200,endMs:1400,confidence:0.9});expect(page.items[0]?.language).toBe(language);expect(page.run.languageDetected).toBeNull();}
    expect(await db.mediaDerivative.count({where:{mediaAssetId:assetId}})).toBe(1);expect(asrCalls).toBe(2);
    const derivative=await db.mediaDerivative.findFirstOrThrow({where:{mediaAssetId:assetId}});
    const probe=await runProcess(config.FFPROBE_PATH,['-v','error','-show_streams','-of','json',join(config.STORAGE_ROOT,derivative.storageKey)],30000);
    const raw:unknown=JSON.parse(probe.stdout);expect(parseProbe(raw).streams[0]).toMatchObject({type:'AUDIO',codec:'pcm_s16le',channels:1,sampleRate:16000});expect(derivative.streamIndex).toBe(2);
  });
  it('samples frames and groups fixture OCR without cross-source fusion or permanent images',async()=>{
    const run=extractionRunSchema.parse((await json(`/episodes/${episodeId}/source-extractions/ocr`,{mediaAssetId:assetId,language:'zh-CN',fps:4,region:'BOTTOM_REGION'})).body);expect((await wait(run.id)).status).toBe('COMPLETED');const page=segmentPageSchema.parse((await json(`/source-extractions/${run.id}/segments`)).body);expect(page.items).toHaveLength(2);expect(page.items[0]).toMatchObject({method:'OCR',text:'我不会走',confidence:0.96});expect(page.items[0]?.providerMetadata).toMatchObject({provider:'paddleocr',observationCount:4});expect(await readdir(config.MEDIA_WORK_ROOT)).toHaveLength(0);
  });
  it('rejects wrong asset ownership, missing streams, image subtitles, invalid settings and unavailable providers',async()=>{
    expect((await json(`/episodes/${randomUUID()}/source-extractions/embedded`,{mediaAssetId:assetId,streamIndex:3})).response.status).toBe(404);
    expect((await json(`/episodes/${episodeId}/source-extractions/embedded`,{mediaAssetId:assetId,streamIndex:0})).response.status).toBe(400);
    const bitmap=await db.mediaStream.create({data:{mediaAssetId:assetId,streamIndex:99,type:'SUBTITLE',codec:'hdmv_pgs_subtitle'}});
    expect((await json(`/episodes/${episodeId}/source-extractions/embedded`,{mediaAssetId:assetId,streamIndex:99})).body).toMatchObject({code:'IMAGE_BASED_STREAM_UNSUPPORTED'});await db.mediaStream.delete({where:{id:bitmap.id}});
    expect((await json(`/episodes/${episodeId}/source-extractions/asr`,{mediaAssetId:assetId,streamIndex:3})).body).toMatchObject({code:'AUDIO_STREAM_NOT_FOUND'});
    expect((await json(`/episodes/${episodeId}/source-extractions/asr`,{mediaAssetId:assetId,streamIndex:1,language:'zh-TW'})).response.status).toBe(400);
    asrAvailable=false;expect((await json(`/episodes/${episodeId}/source-extractions/asr`,{mediaAssetId:assetId,streamIndex:1})).response.status).toBe(503);asrAvailable=true;
    ocrAvailable=false;expect((await json(`/episodes/${episodeId}/source-extractions/ocr`,{mediaAssetId:assetId,language:'en'})).response.status).toBe(503);ocrAvailable=true;
  });
  it('enforces SQL ownership and timing invariants',async()=>{
    const second=await db.episode.create({data:{seriesId,title:'Other episode'}});const job=await db.processingJob.create({data:{episodeId:second.id,mediaAssetId:assetId}});
    await expect(db.sourceExtractionRun.create({data:{episodeId:second.id,mediaAssetId:assetId,method:'OCR',provider:'paddleocr',settings:{},settingsHash:'x',identityHash:randomUUID(),processingJobId:job.id}})).rejects.toThrow();
    await expect(db.sourceSegment.create({data:{extractionRunId:englishRunId,startMs:100,endMs:99,text:'bad',sequence:99,providerMetadata:{}}})).rejects.toThrow();
    await expect(db.sourceSegment.create({data:{extractionRunId:randomUUID(),startMs:0,endMs:10,text:'bad run',sequence:0,providerMetadata:{}}})).rejects.toThrow();
    await db.processingJob.delete({where:{id:job.id}});
  });
  it('cancels queued and running jobs without partial source persistence or temporary artifacts',async()=>{
    slowAsr=true;const run=extractionRunSchema.parse((await json(`/episodes/${episodeId}/source-extractions/asr`,{mediaAssetId:assetId,streamIndex:1,rerunKey:randomUUID()})).body);
    for(let i=0;i<100;i++){if((await db.sourceExtractionRun.findUniqueOrThrow({where:{id:run.id}})).stage?.startsWith('Transcribing'))break;await new Promise(resolve=>setTimeout(resolve,100));}
    expect(extractionRunSchema.parse((await json(`/source-extractions/${run.id}/cancel`,{})).body).status).toBe('CANCELLED');
    await new Promise(resolve=>setTimeout(resolve,1000));expect(await db.sourceSegment.count({where:{extractionRunId:run.id}})).toBe(0);expect(await readdir(config.MEDIA_WORK_ROOT)).toHaveLength(0);slowAsr=false;
    await worker.close();const queued=extractionRunSchema.parse((await json(`/episodes/${episodeId}/source-extractions/embedded`,{mediaAssetId:assetId,streamIndex:3,rerunKey:randomUUID()})).body);expect((await json(`/source-extractions/${queued.id}/cancel`,{})).body).toMatchObject({status:'CANCELLED'});worker=await createInspectionWorker(config,providers);
  });
  it('fails invalid provider evidence atomically and reports FFmpeg failures',async()=>{
    corruptAsr=true;const run=extractionRunSchema.parse((await json(`/episodes/${episodeId}/source-extractions/asr`,{mediaAssetId:assetId,streamIndex:1,rerunKey:randomUUID()})).body);expect((await wait(run.id)).job.errorCode).toBe('INVALID_PROVIDER_OUTPUT');expect(await db.sourceSegment.count({where:{extractionRunId:run.id}})).toBe(0);corruptAsr=false;
    await expect(extractSubtitle(fixture,88,config.FFMPEG_PATH,10000)).rejects.toMatchObject({code:'PROCESS_FAILED'});
    await expect(prepareAudio(fixture,88,join(root,'bad.wav'),config.FFMPEG_PATH,10000)).rejects.toMatchObject({code:'PROCESS_FAILED'});
    await expect(sampleFrames(fixture,root,{fps:4,region:'FULL_FRAME',bottomFraction:0.4},3000,1,config.FFMPEG_PATH,10000)).rejects.toMatchObject({code:'FRAME_LIMIT_EXCEEDED'});
  });
  it('preserves delayed audio in the media timeline and leaves leading silence',async()=>{
    const media=join(root,'delayed.mkv');const wav=join(root,'delayed.wav');
    const generated=await runProcess(config.FFMPEG_PATH,['-nostdin','-y','-v','error','-f','lavfi','-i','color=size=64x64:rate=10:duration=3','-itsoffset','2','-f','lavfi','-i','sine=frequency=440:sample_rate=16000:duration=1','-map','0:v','-map','1:a','-c:v','mpeg4','-c:a','pcm_s16le',media],30000);expect(generated.exitCode).toBe(0);
    await prepareAudio(media,1,wav,config.FFMPEG_PATH,30000);
    const probe=await runProcess(config.FFPROBE_PATH,['-v','error','-show_format','-of','json',wav],30000);
    expect(Number((JSON.parse(probe.stdout) as {format:{duration:string}}).format.duration)).toBeCloseTo(3,2);
    const bytes=await readFile(wav);const marker=bytes.indexOf(Buffer.from('data'));expect(marker).toBeGreaterThan(0);const pcm=bytes.subarray(marker+8);
    expect(pcm.subarray(0,16000*2*2).every(value=>value===0)).toBe(true);expect(pcm.subarray(16000*2*2).some(value=>value!==0)).toBe(true);
  });
  it('rejects provider model drift and signals cancellation on failed inference',async()=>{
    driftAsr=true;const previous=cancelCalls;const run=extractionRunSchema.parse((await json(`/episodes/${episodeId}/source-extractions/asr`,{mediaAssetId:assetId,streamIndex:1,rerunKey:randomUUID()})).body);
    const failed=await wait(run.id);expect(failed.job.errorCode).toBe('PROVIDER_CONFIGURATION_CHANGED');expect(failed.modelVersion).toBe('fixture');expect(await db.sourceSegment.count({where:{extractionRunId:run.id}})).toBe(0);
    for(let count=0;count<20&&cancelCalls===previous;count++)await new Promise(done=>setTimeout(done,50));expect(cancelCalls).toBeGreaterThan(previous);driftAsr=false;
  });
  it('rolls back source segments when PostgreSQL rejects a final evidence write',async()=>{
    await worker.close();
    try {
      const run=extractionRunSchema.parse((await json(`/episodes/${episodeId}/source-extractions/embedded`,{mediaAssetId:assetId,streamIndex:3,rerunKey:randomUUID()})).body);
      // Fault injection changes only this run's write. The actual PostgreSQL FK
      // rejects it inside the real final transaction, after the job update.
      const faulted=db.$extends({query:{sourceSegment:{async createMany({args,query}){
        const records=Array.isArray(args.data)?args.data:[args.data];
        if(records.some(row=>row.extractionRunId===run.id))args.data=[...records,{...records[0]!,extractionRunId:randomUUID(),sequence:99999}];
        return query(args);
      }}}});
      await expect(processSourceExtraction(run.processingJobId,faulted as unknown as PrismaClient,new LocalStorage(config.STORAGE_ROOT),config,providers)).rejects.toMatchObject({code:'PROCESS_FAILED'});
      expect((await wait(run.id)).status).toBe('FAILED');expect(await db.sourceSegment.count({where:{extractionRunId:run.id}})).toBe(0);
      expect((await db.mediaAsset.findUniqueOrThrow({where:{id:assetId}})).status).toBe('READY');expect(await readdir(config.MEDIA_WORK_ROOT)).toHaveLength(0);
    }finally{worker=await createInspectionWorker(config,providers);}
  });
});
