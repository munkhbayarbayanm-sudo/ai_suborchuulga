import {spawn} from 'node:child_process';
import {AppError} from '@mongolsub/domain';
import {runProcess} from '@mongolsub/media';
import {z} from 'zod';

export const EDITOR_VERSION='subtitle-editor-v1';
export const EDITOR_PROXY_VERSION='editor-proxy-v1';
export const WAVEFORM_VERSION='waveform-v1';
export const EDITOR_PROXY_SETTINGS={version:EDITOR_PROXY_VERSION,container:'mp4',videoCodec:'h264',audioCodec:'aac',pixelFormat:'yuv420p',crf:23,preset:'veryfast',timeline:'media-zero'} as const;
export const WAVEFORM_SETTINGS={version:WAVEFORM_VERSION,sampleRate:8000,channels:1,resolutionsMs:[1000,100,25] as const,timeline:'media-zero'} as const;
export const editorProxySettingsSchema=z.object({version:z.literal(EDITOR_PROXY_VERSION),container:z.literal('mp4'),videoCodec:z.literal('h264'),audioCodec:z.literal('aac'),pixelFormat:z.literal('yuv420p'),crf:z.number().int().min(0).max(51),preset:z.enum(['ultrafast','superfast','veryfast','faster','fast','medium']),timeline:z.literal('media-zero')}).strict();
export const waveformSettingsSchema=z.object({version:z.literal(WAVEFORM_VERSION),sampleRate:z.number().int().min(4000).max(48000),channels:z.literal(1),resolutionsMs:z.array(z.number().int().min(10).max(5000)).min(1).max(6),timeline:z.literal('media-zero'),streamIndex:z.number().int().nonnegative()}).strict();

export function directPlaybackMime(asset:{mimeType:string;containerFormat:string|null;streams:readonly {type:string;codec:string|null}[]}):string|null{
  const formats=(asset.containerFormat??'').toLocaleLowerCase('en').split(',').map(value=>value.trim());const video=asset.streams.find(stream=>stream.type==='VIDEO');const audio=asset.streams.find(stream=>stream.type==='AUDIO');
  if((asset.mimeType==='video/mp4'||formats.some(value=>['mov','mp4','m4a','3gp','3g2','mj2'].includes(value)))&&['h264','avc1'].includes(video?.codec??'')&&(!audio||['aac','mp3'].includes(audio.codec??'')))return'video/mp4';
  if((asset.mimeType==='video/webm'||formats.includes('webm'))&&['vp8','vp9','av1'].includes(video?.codec??'')&&(!audio||['opus','vorbis'].includes(audio.codec??'')))return'video/webm';
  return null;
}

export interface EditorCue {id:string;sequence:number;startMs:number;endMs:number;text:string;revision:number}
export type TimingEdit='MOVE'|'RESIZE_START'|'RESIZE_END';

function assertTiming(startMs:number,endMs:number,durationMs:number){
  if(!Number.isInteger(startMs)||startMs<0)throw new AppError('INVALID_CUE_TIMING','Cue start must be a non-negative integer millisecond value.',422);
  if(!Number.isInteger(endMs)||endMs<=startMs)throw new AppError('INVALID_CUE_TIMING','Cue end must be after cue start.',422);
  if(!Number.isInteger(durationMs)||durationMs<=0||endMs>durationMs)throw new AppError('INVALID_CUE_TIMING','Cue timing exceeds media duration.',422);
}

export function applyTimingEdit(cue:EditorCue,type:TimingEdit,input:{deltaMs:number}|{timeMs:number},durationMs:number){
  let startMs=cue.startMs;let endMs=cue.endMs;
  if(type==='MOVE'){
    const duration=cue.endMs-cue.startMs;const delta=Math.round('deltaMs' in input?input.deltaMs:0);
    startMs=Math.min(Math.max(0,cue.startMs+delta),durationMs-duration);endMs=startMs+duration;
  }else if(type==='RESIZE_START')startMs=Math.round('timeMs' in input?input.timeMs:cue.startMs);
  else endMs=Math.round('timeMs' in input?input.timeMs:cue.endMs);
  assertTiming(startMs,endMs,durationMs);return{startMs,endMs};
}

export function snapTime(candidate:number,points:readonly number[],settings:{enabled:boolean;thresholdMs:number}){
  if(!settings.enabled)return Math.round(candidate);let best=Math.round(candidate);let distance=settings.thresholdMs+1;
  for(const point of points){const current=Math.abs(point-candidate);if(current<distance||(current===distance&&point<best)){best=point;distance=current;}}
  return distance<=settings.thresholdMs?best:Math.round(candidate);
}

export type CueWarning='EMPTY_CUE'|'EXTREMELY_SHORT'|'OVERLAP'|'OUTSIDE_MEDIA';
export function cueWarnings(cue:EditorCue,others:readonly EditorCue[],durationMs:number,minDurationMs=250):CueWarning[]{
  const warnings:CueWarning[]=[];if(!cue.text.trim())warnings.push('EMPTY_CUE');if(cue.endMs-cue.startMs<minDurationMs)warnings.push('EXTREMELY_SHORT');
  if(cue.startMs<0||cue.endMs>durationMs||cue.endMs<=cue.startMs)warnings.push('OUTSIDE_MEDIA');
  if(others.some(other=>other.id!==cue.id&&Math.min(cue.endMs,other.endMs)>Math.max(cue.startMs,other.startMs)))warnings.push('OVERLAP');
  return warnings;
}

function safeCaret(text:string,requested:number){
  const boundaries=[0];let offset=0;for(const point of Array.from(text)){offset+=point.length;boundaries.push(offset);}
  const clamped=Math.min(Math.max(0,requested),text.length);return boundaries.reduce((best,value)=>Math.abs(value-clamped)<Math.abs(best-clamped)?value:best,0);
}
export function splitCueText(text:string,relative:number,caret?:number){
  const trimmed=text.trim();if(!trimmed)return{left:'',right:''};
  let split:number;
  if(caret!==undefined)split=safeCaret(text,caret);
  else{
    const target=Math.min(1,Math.max(0,relative))*text.length;const boundaries=[...text.matchAll(/\s+/gu)].flatMap(match=>[match.index,match.index+match[0].length]);
    split=boundaries.length?boundaries.reduce((best,value)=>Math.abs(value-target)<Math.abs(best-target)?value:best,boundaries[0]!):safeCaret(text,Math.round(target));
  }
  return{left:text.slice(0,split).trim(),right:text.slice(split).trim()};
}

const uuid=z.string().uuid();const timing=z.object({cueId:uuid,startMs:z.number().int().nonnegative(),endMs:z.number().int().positive()}).strict().refine(value=>value.endMs>value.startMs,{message:'Cue end must be after start.'});
const base=z.object({baseRevision:z.number().int().nonnegative(),clientOperationId:uuid.optional()});
export const editorOperationRequestSchema=z.discriminatedUnion('type',[
  base.extend({type:z.literal('UPDATE_TEXT'),payload:z.object({cueId:uuid,text:z.string().max(8000)}).strict()}).strict(),
  base.extend({type:z.literal('MOVE_CUE'),payload:timing}).strict(),
  base.extend({type:z.literal('RESIZE_START'),payload:timing}).strict(),
  base.extend({type:z.literal('RESIZE_END'),payload:timing}).strict(),
  base.extend({type:z.literal('SPLIT_CUE'),payload:z.object({cueId:uuid,splitMs:z.number().int().nonnegative(),caret:z.number().int().nonnegative().optional()}).strict()}).strict(),
  base.extend({type:z.literal('MERGE_CUES'),payload:z.object({cueIds:z.array(uuid).min(2).max(12),separator:z.enum(['SPACE','LINE_BREAK']).default('SPACE')}).strict()}).strict(),
  base.extend({type:z.literal('DELETE_CUE'),payload:z.object({cueId:uuid}).strict()}).strict(),
  base.extend({type:z.literal('CREATE_CUE'),payload:z.object({startMs:z.number().int().nonnegative(),endMs:z.number().int().positive(),text:z.string().max(8000).default('')}).strict().refine(value=>value.endMs>value.startMs,{message:'Cue end must be after start.'})}).strict(),
  base.extend({type:z.literal('SET_CUE_STATUS'),payload:z.object({cueId:uuid,status:z.enum(['NORMAL','REVIEW','APPROVED'])}).strict()}).strict(),
  base.extend({type:z.literal('ACCEPT_AI_REWRITE'),payload:z.object({cueId:uuid,proposalId:uuid}).strict()}).strict(),
]);
export type EditorOperationRequest=z.infer<typeof editorOperationRequestSchema>;

export const cueSnapshotSchema=z.object({
  id:uuid,sequence:z.number().int().nonnegative(),startMs:z.number().int().nonnegative(),endMs:z.number().int().positive(),text:z.string().max(8000),
  status:z.enum(['NORMAL','REVIEW','APPROVED']),origin:z.enum(['LOCALIZED','MANUAL']),revision:z.number().int().nonnegative(),deletedAt:z.string().datetime().nullable(),
  localizedSegmentIds:z.array(uuid).max(100),
}).strict().refine(value=>value.endMs>value.startMs,'Cue end must be after start.');
export const operationPayloadSchema=z.object({cues:z.array(cueSnapshotSchema).max(100),proposalId:uuid.nullable().optional()}).strict();
export type CueSnapshot=z.infer<typeof cueSnapshotSchema>;
export type OperationPayload=z.infer<typeof operationPayloadSchema>;

type HistoryOperation={id:string;type:string;targetOperationId:string|null};
export function resolveHistoryTargets(operations:readonly HistoryOperation[]){
  const applied:string[]=[];const redo:string[]=[];
  for(const operation of operations){
    if(operation.type==='UNDO'){
      if(operation.targetOperationId&&applied.at(-1)===operation.targetOperationId){applied.pop();redo.push(operation.targetOperationId);}
    }else if(operation.type==='REDO'){
      if(operation.targetOperationId&&redo.at(-1)===operation.targetOperationId){redo.pop();applied.push(operation.targetOperationId);}
    }else{applied.push(operation.id);redo.length=0;}
  }
  return{undoOperationId:applied.at(-1)??null,redoOperationId:redo.at(-1)??null};
}

export type ByteRange={kind:'FULL'|'PARTIAL';start:number;end:number;length:number}|{kind:'UNSATISFIABLE';size:number};
export function parseByteRange(header:string|undefined,size:number):ByteRange{
  if(!Number.isSafeInteger(size)||size<=0)return{kind:'UNSATISFIABLE',size:Math.max(0,size)};
  if(!header)return{kind:'FULL',start:0,end:size-1,length:size};
  const match=/^bytes=(\d*)-(\d*)$/.exec(header.trim());if(!match||(!match[1]&&!match[2]))return{kind:'UNSATISFIABLE',size};
  let start:number;let end:number;
  if(!match[1]){const suffix=Number(match[2]);if(!Number.isSafeInteger(suffix)||suffix<=0)return{kind:'UNSATISFIABLE',size};start=Math.max(0,size-suffix);end=size-1;}
  else{start=Number(match[1]);end=match[2]?Number(match[2]):size-1;if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=size||end<start)return{kind:'UNSATISFIABLE',size};end=Math.min(end,size-1);}
  return{kind:'PARTIAL',start,end,length:end-start+1};
}

export interface WaveformLevel{bucketMs:number;peaks:[number,number][]}
export interface WaveformPeaks{version:typeof WAVEFORM_VERSION;durationMs:number;sampleRate:number;levels:WaveformLevel[]}
export interface PeakAggregator{push(chunk:Uint8Array):void;finish(durationMs:number):WaveformPeaks}
export function createPeakAggregator(options:{sampleRate:number;resolutionsMs:readonly number[]}):PeakAggregator{
  const sampleRate=options.sampleRate;if(!Number.isInteger(sampleRate)||sampleRate<=0)throw new AppError('INVALID_WAVEFORM_SETTINGS','Waveform sample rate must be positive.');
  const states=options.resolutionsMs.map(bucketMs=>{const count=Math.round(sampleRate*bucketMs/1000);if(!Number.isInteger(bucketMs)||bucketMs<=0||count<1)throw new AppError('INVALID_WAVEFORM_SETTINGS','Waveform resolution is invalid.');return{bucketMs,count,index:0,min:32767,max:-32768,peaks:[] as [number,number][]};});
  let carry:Uint8Array|undefined;
  const feed=(sample:number)=>{for(const state of states){state.min=Math.min(state.min,sample);state.max=Math.max(state.max,sample);state.index++;if(state.index===state.count){state.peaks.push([state.min/32768,state.max/32768]);state.index=0;state.min=32767;state.max=-32768;}}};
  return{push(chunk){let bytes=chunk;if(carry){const joined=new Uint8Array(carry.length+chunk.length);joined.set(carry);joined.set(chunk,carry.length);bytes=joined;carry=undefined;}const complete=bytes.length-(bytes.length%2);const view=new DataView(bytes.buffer,bytes.byteOffset,complete);for(let offset=0;offset<complete;offset+=2)feed(view.getInt16(offset,true));if(complete<bytes.length)carry=bytes.slice(complete);},finish(durationMs){if(carry?.length)throw new AppError('INVALID_PCM','PCM stream ended mid-sample.');for(const state of states)if(state.index)state.peaks.push([state.min/32768,state.max/32768]);return{version:WAVEFORM_VERSION,durationMs,sampleRate,levels:states.map(({bucketMs,peaks})=>({bucketMs,peaks}))};}};
}

export async function generateEditorProxy(input:string,output:string,ffmpeg:string,timeoutMs:number,signal?:AbortSignal){
  const result=await runProcess(ffmpeg,['-nostdin','-y','-v','error','-copyts','-start_at_zero','-i',input,'-map','0:v:0','-map','0:a:0?','-sn','-dn','-c:v','libx264','-preset',EDITOR_PROXY_SETTINGS.preset,'-crf',String(EDITOR_PROXY_SETTINGS.crf),'-pix_fmt',EDITOR_PROXY_SETTINGS.pixelFormat,'-c:a','aac','-b:a','128k','-af','aresample=async=1:first_pts=0','-movflags','+faststart','-avoid_negative_ts','disabled','-f','mp4',output],timeoutMs,4*1024*1024,signal);
  if(result.exitCode!==0)throw new AppError('EDITOR_PROXY_FAILED','FFmpeg could not create a browser-safe editor preview.',422,{toolExitCode:result.exitCode});
}

export function generateWaveform(input:string,settings:z.infer<typeof waveformSettingsSchema>,ffmpeg:string,timeoutMs:number,durationMs:number,signal?:AbortSignal):Promise<WaveformPeaks>{
  const parsed=waveformSettingsSchema.parse(settings);return new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(new AppError('CANCELLED','Waveform generation cancelled.'));return;}
    const aggregator=createPeakAggregator({sampleRate:parsed.sampleRate,resolutionsMs:parsed.resolutionsMs});
    const child=spawn(ffmpeg,['-nostdin','-v','error','-copyts','-start_at_zero','-i',input,'-map',`0:${parsed.streamIndex}`,'-vn','-sn','-dn','-af','aresample=async=1:first_pts=0','-ac','1','-ar',String(parsed.sampleRate),'-c:a','pcm_s16le','-f','s16le','pipe:1'],{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
    let stderrBytes=0;let settled=false;
    const finish=(error?:unknown)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);if(error)reject(error);else{try{resolve(aggregator.finish(durationMs));}catch(failure){reject(failure);}}};
    const abort=()=>{child.kill('SIGKILL');finish(new AppError('CANCELLED','Waveform generation cancelled.'));};signal?.addEventListener('abort',abort,{once:true});
    const timer=setTimeout(()=>{child.kill('SIGKILL');finish(new AppError('MEDIA_TIMEOUT','Waveform generation timed out.',422));},timeoutMs);
    child.stdout.on('data',(chunk:Buffer)=>aggregator.push(chunk));child.stderr.on('data',(chunk:Buffer)=>{stderrBytes+=chunk.length;if(stderrBytes>4*1024*1024){child.kill('SIGKILL');finish(new AppError('MEDIA_OUTPUT_LIMIT','Waveform tool output exceeded the diagnostic limit.'));}});
    child.once('error',error=>finish(new AppError('MEDIA_TOOL_MISSING','FFmpeg could not start for waveform generation.',422,{message:error.message})));
    child.once('close',code=>{if(code!==0)finish(new AppError('WAVEFORM_GENERATION_FAILED','FFmpeg could not decode the selected audio stream.',422,{toolExitCode:code}));else finish();});
  });
}
