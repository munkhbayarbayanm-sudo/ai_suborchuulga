import {beforeAll,afterAll,describe,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {PrismaClient,type Prisma} from '../../packages/database/src/index';
import {loadConfig} from '../../packages/config/src/index';
import {createApi} from '../../apps/api/src/app';
import {createInspectionWorker} from '../../apps/worker/src/worker';
import {processFusion} from '../../apps/worker/src/fusion';
import {fusionRunSchema,transcriptPageSchema,transcriptDetailSchema,fusionPageSchema} from '../../packages/contracts/src/index';
describe('Phase03 real HTTP/PostgreSQL/BullMQ with persisted synthetic evidence',()=>{
  const config=loadConfig();const db=new PrismaClient({datasourceUrl:config.DATABASE_URL});
  let app:Awaited<ReturnType<typeof createApi>>;let worker:Awaited<ReturnType<typeof createInspectionWorker>>;let url:string;let seriesId:string;let episodeId:string;let assetId:string;let embeddedId:string;let asrId:string;let ocrId:string;let chineseId:string;let fusionId:string;let manualId:string;let sourceSnapshot:string;
  beforeAll(async()=>{const series=await db.series.create({data:{title:'Phase03 synthetic integration',sourceLanguage:'en'}});seriesId=series.id;const episode=await db.episode.create({data:{seriesId,title:'Independent synthetic evidence',sourceLanguage:'en'}});episodeId=episode.id;const asset=await db.mediaAsset.create({data:{episodeId,originalFilename:'synthetic-evidence.mkv',storageKey:randomUUID(),mimeType:'video/x-matroska',sizeBytes:1n,durationMs:60000,status:'READY'}});assetId=asset.id;
    async function input(method:'EMBEDDED_SUBTITLE'|'ASR'|'OCR',language:string,values:{startMs:number,endMs:number,text:string}[]){const job=await db.processingJob.create({data:{episodeId,mediaAssetId:assetId,jobType:method==='ASR'?'TRANSCRIBE_AUDIO':method==='OCR'?'OCR_BURNED_SUBTITLE':'EXTRACT_EMBEDDED_SUBTITLE',status:'COMPLETED',progress:100}});const settings=method==='OCR'?{method,language,fps:4,region:'BOTTOM_REGION',bottomFraction:0.4,minimumConfidence:0.5}:method==='ASR'?{method,language,streamIndex:1,align:true,diarize:false}:{method,language,streamIndex:2};const run=await db.sourceExtractionRun.create({data:{episodeId,mediaAssetId:assetId,method,provider:method==='ASR'?'whisperx':method==='OCR'?'paddleocr':'ffmpeg',providerVersion:'synthetic-1',modelVersion:method==='EMBEDDED_SUBTITLE'?null:'synthetic',streamIndex:method==='OCR'?null:method==='ASR'?1:2,languageRequested:language,status:'COMPLETED',settings,settingsHash:randomUUID(),identityHash:randomUUID(),processingJobId:job.id}});
      for(const [sequence,value]of values.entries()){const providerMetadata:Prisma.InputJsonValue=method==='ASR'?{provider:'whisperx',model:'synthetic',warnings:[]}:method==='OCR'?{provider:'paddleocr',model:'synthetic',representativeTimestampMs:value.startMs,rawText:value.text,box:null,observationCount:4}:{provider:'ffmpeg',codec:'subrip',trackLanguage:language};await db.sourceSegment.create({data:{...value,extractionRunId:run.id,sequence,language,confidence:method==='OCR'?0.96:null,speaker:method==='ASR'?'Speaker 0':null,words:method==='ASR'?[{text:value.text,startMs:value.startMs,endMs:value.endMs,confidence:0.9,speaker:'Speaker 0'}]:[],providerMetadata}});}return run.id;}
    embeddedId=await input('EMBEDDED_SUBTITLE','en',[{startMs:10000,endMs:12000,text:'Hello.'},{startMs:20000,endMs:22000,text:'I will come back.'}]);
    asrId=await input('ASR','en',[{startMs:10100,endMs:11900,text:'Hello.'},{startMs:20100,endMs:21900,text:"I won't come back."}]);
    ocrId=await input('OCR','en',[{startMs:10050,endMs:12200,text:'Hello.'},{startMs:20050,endMs:22100,text:'I will come back.'}]);
    chineseId=await input('OCR','zh-CN',[{startMs:10050,endMs:12100,text:'你要去哪儿？'}]);
    sourceSnapshot=JSON.stringify(await db.sourceSegment.findMany({where:{extractionRun:{episodeId}},orderBy:[{extractionRunId:'asc'},{sequence:'asc'}]}));
    app=await createApi(config);await app.listen(0,'127.0.0.1');url=await app.getUrl();worker=await createInspectionWorker(config);
  });
  afterAll(async()=>{if(worker)await worker.close();if(app)await app.close();if(seriesId)await db.series.delete({where:{id:seriesId}});await db.$disconnect();});
  async function json(path:string,input?:unknown,method='POST'){const response=await fetch(url+path,input===undefined?{}:{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});return{response,body:await response.json() as unknown};}
  async function wait(id:string){for(let i=0;i<200;i++){const run=fusionRunSchema.parse((await json(`/fusion-runs/${id}`)).body);if(['COMPLETED','FAILED','CANCELLED'].includes(run.status))return run;await new Promise(done=>setTimeout(done,100));}throw Error('Fusion did not finish');}
  const request=()=>({mediaAssetId:assetId,inputRunIds:[embeddedId,asrId,ocrId],language:'AUTO'});
  it('creates independent canonical evidence, classifications and efficient paginated inspection',async()=>{
    const created=await json(`/episodes/${episodeId}/fusion-runs`,request());expect(created.response.status,JSON.stringify(created.body)).toBe(201);fusionId=fusionRunSchema.parse(created.body).id;const run=await wait(fusionId);expect(run.status,JSON.stringify(run.job)).toBe('COMPLETED');expect(run.canonicalLanguage).toBe('en');expect(run.isActive).toBe(false);expect(run.coverageMetrics?.canonicalSegmentCount).toBe(2);
    const page=transcriptPageSchema.parse((await json(`/fusion-runs/${fusionId}/segments?limit=1`)).body);expect(page.total).toBe(2);expect(page.items[0]?.text).toBe('Hello.');expect(page.items[0]?.reviewCategory).toBe('HIGH_CONFIDENCE');expect(page.items[0]?.evidence).toHaveLength(3);expect(page.items[0]?.evidence.some(link=>link.source.words.length>0)).toBe(true);manualId=page.items[0]!.id;
    const conflict=transcriptPageSchema.parse((await json(`/fusion-runs/${fusionId}/segments?offset=1&limit=1`)).body).items[0]!;expect(conflict.text).toBe('I will come back.');expect(conflict.reviewCategory).not.toBe('HIGH_CONFIDENCE');expect(conflict.evidence.find(link=>link.role==='CONFLICTING')?.source.text).toBe("I won't come back.");expect(transcriptPageSchema.parse((await json(`/fusion-runs/${fusionId}/segments?filter=HIGH_CONFIDENCE`)).body).total).toBe(1);
  });
  it('deduplicates requests and enforces language/asset/input boundaries',async()=>{
    const same=await Promise.all([json(`/episodes/${episodeId}/fusion-runs`,request()),json(`/episodes/${episodeId}/fusion-runs`,{...request(),inputRunIds:[ocrId,asrId,embeddedId]})]);expect(same.map(result=>fusionRunSchema.parse(result.body).id)).toEqual([fusionId,fusionId]);
    expect((await json(`/episodes/${randomUUID()}/fusion-runs`,request())).response.status).toBe(404);
    expect((await json(`/episodes/${episodeId}/fusion-runs`,{...request(),inputRunIds:[randomUUID()]})).response.status).toBe(400);
    expect((await json(`/episodes/${episodeId}/fusion-runs`,{...request(),inputRunIds:[asrId,asrId]})).response.status).toBe(400);
    expect((await json(`/episodes/${episodeId}/fusion-runs`,{...request(),language:'CHINESE'})).body).toMatchObject({code:'FUSION_LANGUAGE_UNAVAILABLE'});
    expect((await json(`/episodes/${episodeId}/fusion-runs`,{...request(),settings:{temporal:{maximumGapMs:-1}}})).response.status).toBe(400);
  });
  it('keeps cross-language evidence timing-only without translation or lexical scores',async()=>{
    const run=fusionRunSchema.parse((await json(`/episodes/${episodeId}/fusion-runs`,{mediaAssetId:assetId,inputRunIds:[embeddedId,chineseId],language:'CHINESE'})).body);expect((await wait(run.id)).status).toBe('COMPLETED');const segment=transcriptPageSchema.parse((await json(`/fusion-runs/${run.id}/segments`)).body).items[0]!;expect(segment.text).toBe('你要去哪儿？');expect(segment.language).toBe('zh');expect(segment.evidence.find(link=>link.source.language==='en')).toMatchObject({role:'TIMING_ONLY',textSimilarity:null,contributionWeight:null});
  });
  it('persists manual text/timing/approval with derived values and optimistic conflict protection',async()=>{
    const edited=transcriptDetailSchema.parse((await json(`/transcript-segments/${manualId}`,{expectedRevision:0,text:'Manual correction.',startMs:10200,endMs:11800,reviewStatus:'APPROVED'},'PATCH')).body);expect(edited).toMatchObject({text:'Manual correction.',derivedText:'Hello.',derivationType:'MANUAL',reviewStatus:'APPROVED',editRevision:1});expect(edited.manualEditedAt).not.toBeNull();
    expect((await json(`/transcript-segments/${manualId}`,{expectedRevision:0,text:'Stale edit'},'PATCH')).response.status).toBe(409);expect((await json(`/transcript-segments/${manualId}`,{expectedRevision:1,startMs:11900},'PATCH')).response.status).toBe(400);
    expect(transcriptPageSchema.parse((await json(`/fusion-runs/${fusionId}/segments?filter=MANUAL`)).body).total).toBe(1);
    expect(JSON.stringify(await db.sourceSegment.findMany({where:{extractionRun:{episodeId}},orderBy:[{extractionRunId:'asc'},{sequence:'asc'}]}))).toBe(sourceSnapshot);
  });
  it('preserves run history and requires explicit active-run selection',async()=>{
    expect((await json(`/fusion-runs/${fusionId}/activate`,{})).body).toMatchObject({isActive:true});
    const rerunKey=randomUUID();const input={...request(),rerunKey};const created=fusionRunSchema.parse((await json(`/episodes/${episodeId}/fusion-runs`,input)).body);expect(created.id).not.toBe(fusionId);expect(fusionRunSchema.parse((await json(`/episodes/${episodeId}/fusion-runs`,input)).body).id).toBe(created.id);expect((await wait(created.id)).status).toBe('COMPLETED');
    expect(transcriptDetailSchema.parse((await json(`/transcript-segments/${manualId}`)).body).text).toBe('Manual correction.');expect(transcriptPageSchema.parse((await json(`/fusion-runs/${created.id}/segments`)).body).items[0]?.text).toBe('Hello.');
    expect(fusionPageSchema.parse((await json(`/episodes/${episodeId}/fusion-runs?limit=1`)).body).activeRunId).toBe(fusionId);await json(`/fusion-runs/${created.id}/activate`,{});expect((await db.episode.findUniqueOrThrow({where:{id:episodeId}})).activeFusionRunId).toBe(created.id);
  });
  it('cancels queued fusion without partial transcript and rejects activation',async()=>{
    await worker.close();try{const run=fusionRunSchema.parse((await json(`/episodes/${episodeId}/fusion-runs`,{...request(),rerunKey:randomUUID()})).body);expect((await json(`/fusion-runs/${run.id}/cancel`,{})).body).toMatchObject({status:'CANCELLED'});expect((await json(`/fusion-runs/${run.id}/activate`,{})).response.status).toBe(409);await processFusion(run.processingJobId,db);expect(await db.transcriptSegment.count({where:{fusionRunId:run.id}})).toBe(0);}finally{worker=await createInspectionWorker(config);}
  });
  it('observes cancellation immediately before final persistence',async()=>{
    await worker.close();try{const run=fusionRunSchema.parse((await json(`/episodes/${episodeId}/fusion-runs`,{...request(),rerunKey:randomUUID()})).body);let cancelled=false;const hooked=db.$extends({query:{processingJob:{async updateMany({args,query}){if(args.data.progress===90&&!cancelled){cancelled=true;await json(`/fusion-runs/${run.id}/cancel`,{});}return query(args);}}}});await processFusion(run.processingJobId,hooked as unknown as PrismaClient);expect((await wait(run.id)).status).toBe('CANCELLED');expect(await db.transcriptSegment.count({where:{fusionRunId:run.id}})).toBe(0);}finally{worker=await createInspectionWorker(config);}
  });
  it('rolls back rejected PostgreSQL final writes and maintains ownership constraints',async()=>{
    await worker.close();try{const run=fusionRunSchema.parse((await json(`/episodes/${episodeId}/fusion-runs`,{...request(),rerunKey:randomUUID()})).body);const hooked=db.$extends({query:{transcriptSegment:{async createMany({args,query}){const rows=Array.isArray(args.data)?args.data:[args.data];args.data=[...rows,{...rows[0]!,fusionRunId:randomUUID(),sequence:9999}];return query(args);}}}});await expect(processFusion(run.processingJobId,hooked as unknown as PrismaClient)).rejects.toMatchObject({code:'FUSION_FAILED'});expect((await wait(run.id)).status).toBe('FAILED');expect(await db.transcriptSegment.count({where:{fusionRunId:run.id}})).toBe(0);
      const chineseSource=await db.sourceSegment.findFirstOrThrow({where:{extractionRunId:chineseId}});await expect(db.transcriptEvidenceLink.create({data:{transcriptSegmentId:manualId,fusionRunId:fusionId,sourceSegmentId:chineseSource.id,sourceExtractionRunId:chineseId,role:'TIMING_ONLY',alignmentScore:1,textSimilarity:null,temporalOverlap:1,contributionWeight:null}})).rejects.toThrow();
      expect(JSON.stringify(await db.sourceSegment.findMany({where:{extractionRun:{episodeId}},orderBy:[{extractionRunId:'asc'},{sequence:'asc'}]}))).toBe(sourceSnapshot);
    }finally{worker=await createInspectionWorker(config);}
  });
});
