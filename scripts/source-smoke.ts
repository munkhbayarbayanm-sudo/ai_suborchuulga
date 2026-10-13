// Opt-in real-provider verification. Requires synthetic images/speech prepared by
// services/providers/verify_real.py and actual compiled API/worker/provider processes.
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runProcess } from '../packages/media/src/index';
import { episodeSchema, seriesSchema, importResultSchema, mediaDetailSchema, jobSchema, extractionRunSchema, segmentPageSchema, extractionReadinessSchema } from '../packages/contracts/src/index';
const base=`http://127.0.0.1:${process.env.API_PORT??'4000'}`;
async function json(path:string,input?:unknown):Promise<unknown> {
  const response=await fetch(base+path,input===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
  if(!response.ok)throw new Error(`Real source smoke request ${path} failed (${response.status}).`);
  return response.json();
}
async function waitRun(id:string) {
  for(let attempt=0;attempt<1200;attempt++) {
    const run=extractionRunSchema.parse(await json(`/source-extractions/${id}`));
    if(run.status==='FAILED'||run.status==='CANCELLED')throw new Error(`Real ${run.method} smoke failed: ${run.job?.errorCode}`);
    if(run.status==='COMPLETED')return run;
    await new Promise(done=>setTimeout(done,500));
  }
  throw new Error('Real-provider source smoke timed out.');
}
const readiness=extractionReadinessSchema.parse(await json('/providers/readiness'));
if([readiness.embedded,readiness.asr,readiness.ocr].some(p=>p.state==='UNAVAILABLE'))throw new Error('Actual providers must be available for this opt-in smoke.');
const directory=resolve('data/provider-smoke');
await mkdir(directory,{recursive:true});
const series=seriesSchema.parse(await json('/series',{title:'Phase02 real CPU verification',sourceLanguage:'en',description:'Legal synthesized speech and drawn text; independent evidence.'}));
const results=[];
for(const language of ['en','zh-CN','zh-TW'] as const) {
  const output=resolve(directory,`real-${language}.mkv`); const subtitle=resolve(directory,`real-${language}.srt`);
  await writeFile(subtitle,'1\n00:00:00,200 --> 00:00:06,500\nHello Studio. This is synthetic source evidence.\n');
  try {
    const result=await runProcess(process.env.FFMPEG_PATH??'ffmpeg',['-nostdin','-y','-v','error','-loop','1','-framerate','24','-i',resolve(directory,`synthetic-text-${language}.png`),'-i',resolve(directory,'synthetic.wav'),'-i',subtitle,'-map','0:v','-map','1:a','-map','2:s','-vf','pad=640:360:0:240:color=black','-t','7','-c:v','mpeg4','-pix_fmt','yuv420p','-c:a','pcm_s16le','-c:s','srt','-metadata:s:a','language=eng','-metadata:s:s','language=eng',output],30000);
    if(result.exitCode!==0)throw new Error('Real synthetic source fixture generation failed.');
  } finally {await rm(subtitle,{force:true});}
  const episode=episodeSchema.parse(await json(`/series/${series.id}/episodes`,{title:`Actual ${language} OCR evidence`,episodeNumber:results.length+1}));
  const form=new FormData();form.append('file',new Blob([new Uint8Array(await readFile(output))],{type:'video/x-matroska'}),`real-${language}.mkv`);
  const response=await fetch(`${base}/episodes/${episode.id}/media`,{method:'POST',body:form});
  if(!response.ok)throw new Error('Real fixture import failed.');
  const imported=importResultSchema.parse(await response.json());
  let inspected=false;
  for(let count=0;count<100;count++) {
    const job=jobSchema.parse(await json(`/jobs/${imported.job.id}`));
    if(job.status==='FAILED')throw new Error('Real fixture inspection failed.');
    if(job.status==='COMPLETED'){inspected=true;break;}
    await new Promise(done=>setTimeout(done,200));
  }
  if(!inspected)throw new Error('Real fixture inspection timed out.');
  const asset=mediaDetailSchema.parse(await json(`/media/${imported.asset.id}`));
  const runs=[];
  if(language==='en') {
    const subtitleStream=asset.streams.find(s=>s.type==='SUBTITLE');const audio=asset.streams.find(s=>s.type==='AUDIO');
    if(!subtitleStream||!audio)throw new Error('Real fixture streams are missing.');
    runs.push(extractionRunSchema.parse(await json(`/episodes/${episode.id}/source-extractions/embedded`,{mediaAssetId:asset.id,streamIndex:subtitleStream.streamIndex})));
    runs.push(extractionRunSchema.parse(await json(`/episodes/${episode.id}/source-extractions/asr`,{mediaAssetId:asset.id,streamIndex:audio.streamIndex,language:'en',align:true,diarize:false})));
  }
  runs.push(extractionRunSchema.parse(await json(`/episodes/${episode.id}/source-extractions/ocr`,{mediaAssetId:asset.id,language,fps:4,region:'BOTTOM_REGION',bottomFraction:0.4,minimumConfidence:0.5})));
  const evidence=[];
  for(const request of runs) {
    const run=await waitRun(request.id);
    const page=segmentPageSchema.parse(await json(`/source-extractions/${run.id}/segments?limit=100`));
    if(!page.total||!run.providerVersion||run.providerVersion.includes('fixture'))throw new Error('Actual persisted provider evidence missing.');
    const words=page.items.reduce((sum,s)=>sum+s.words.filter(w=>w.startMs!==null).length,0);
    if(run.method==='ASR'&&!words)throw new Error('Actual aligned ASR words were not persisted.');
    if(run.method==='OCR'&&!page.items.some(s=>s.text.includes(language==='en'?'Hello':'你好')))throw new Error('Actual burned-subtitle recognition failed.');
    evidence.push({runId:run.id,method:run.method,provider:run.provider,providerVersion:run.providerVersion,modelVersion:run.modelVersion,device:run.device,segments:page.total,words,processingDurationMs:run.processingDurationMs,text:page.items.map(s=>s.text)});
  }
  results.push({episodeId:episode.id,assetId:asset.id,language,evidence});
}
await writeFile(resolve('data/phase02-runtime-smoke.json'),JSON.stringify({seriesId:series.id,results},null,2));
console.info(JSON.stringify({event:'real_source_runtime_smoke_passed',seriesId:series.id,results}));
