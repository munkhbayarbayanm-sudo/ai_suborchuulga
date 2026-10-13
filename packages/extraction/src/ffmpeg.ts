import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { AppError } from '@mongolsub/domain';
import { runProcess } from '@mongolsub/media';
import type { ProviderReadiness } from '@mongolsub/contracts';
export async function embeddedReadiness(executable:string):Promise<ProviderReadiness> {
  try { const result=await runProcess(executable,['-version'],3000,64000);const version=/ffmpeg version ([^\s]+)/.exec(result.stdout)?.[1]?.slice(0,120)??null;
    return {provider:'ffmpeg',state:result.exitCode===0?'READY_CPU':'UNAVAILABLE',version,model:null,message:result.exitCode===0?null:'FFmpeg is unavailable.'};
  } catch { return {provider:'ffmpeg',state:'UNAVAILABLE',version:null,model:null,message:'FFmpeg is unavailable.'}; }
}
export function textSubtitleSupported(codec:string|null):boolean { return ['subrip','srt','ass','ssa','webvtt','mov_text','text'].includes(codec??''); }
async function checked(executable:string,args:string[],timeout:number,signal?:AbortSignal):Promise<string> {
  const result=await runProcess(executable,args,timeout,16*1024*1024,signal);
  if(result.exitCode!==0) throw new AppError('PROCESS_FAILED','FFmpeg source preparation failed.',400,{toolExitCode:result.exitCode});
  return result.stdout;
}
export function extractSubtitle(path:string,index:number,exe:string,timeout:number,signal?:AbortSignal):Promise<string> {
  return checked(exe,['-nostdin','-v','error','-i',path,'-map',`0:${index}`,'-vn','-an','-c:s','srt','-f','srt','pipe:1'],timeout,signal);
}
export async function prepareAudio(path:string,index:number,output:string,exe:string,timeout:number,signal?:AbortSignal):Promise<void> {
  // Preserve the media timeline: pad a delayed selected stream from normalized
  // input time zero and repair timestamp gaps before a WAV drops its PTS values.
  await checked(exe,['-nostdin','-y','-v','error','-i',path,'-map',`0:${index}`,'-vn','-sn','-af','aresample=async=1:first_pts=0','-ac','1','-ar','16000','-c:a','pcm_s16le','-f','wav',output],timeout,signal);
}
export async function sampleFrames(path:string,directory:string,settings:{fps:number;region:string;bottomFraction:number},durationMs:number,maxFrames:number,exe:string,timeout:number,signal?:AbortSignal) {
  if(Math.ceil(durationMs/1000*settings.fps)>maxFrames) throw new AppError('FRAME_LIMIT_EXCEEDED','Reduce OCR sampling rate: this source exceeds the configured frame budget.');
  const crop=settings.region==='BOTTOM_REGION'?`,crop=iw:ih*${settings.bottomFraction}:0:ih*(1-${settings.bottomFraction})`:'';
  await checked(exe,['-nostdin','-y','-v','error','-i',path,'-an','-sn','-vf',`fps=${settings.fps}:start_time=0${crop},scale=min(1280\\,iw):-2`,'-frames:v',String(maxFrames),'-q:v','3',join(directory,'frame-%08d.jpg')],timeout,signal);
  const files=(await readdir(directory)).filter(name=>/^frame-\d{8}\.jpg$/.test(name)).sort();
  return files.map((name,index)=>({path:join(directory,name),timestampMs:Math.round(index*1000/settings.fps)})).filter(frame=>frame.timestampMs<durationMs);
}
