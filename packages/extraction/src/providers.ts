import { z } from 'zod';
import { AppError } from '@mongolsub/domain';
import { providerReadinessSchema, segmentEvidenceSchema, boxSchema, type ProviderReadiness } from '@mongolsub/contracts';
import type { Config } from '@mongolsub/config';
const asrResultSchema = z.object({ provider:z.literal('whisperx'), providerVersion:z.string().max(120), modelVersion:z.string().max(200), languageDetected:z.enum(['en','zh']).nullable(), device:z.enum(['cpu','gpu']), segments:z.array(segmentEvidenceSchema).max(50000), warnings:z.array(z.string().max(500)).max(20) });
const observationSchema = z.object({ timestampMs:z.number().int().nonnegative(), text:z.string().max(20000), confidence:z.number().min(0).max(1).nullable(), box:boxSchema.nullable() });
const ocrResultSchema = z.object({ provider:z.literal('paddleocr'), providerVersion:z.string().max(120), modelVersion:z.string().max(200), languageDetected:z.null(), device:z.enum(['cpu','gpu']), observations:z.array(observationSchema).max(2000), warnings:z.array(z.string().max(500)).max(20) });
export type AsrResult = z.infer<typeof asrResultSchema>;
export type OcrResult = z.infer<typeof ocrResultSchema>;
export type OcrObservation = z.infer<typeof observationSchema>;
export interface AsrInput { runId:string; audioPath:string; language:'en'|'zh'|null; align:boolean; diarize:boolean }
export interface OcrInput { runId:string; language:'en'|'zh-CN'|'zh-TW'; frames:{timestampMs:number;path:string}[] }
export interface AsrProvider { readiness():Promise<ProviderReadiness>; transcribe(input:AsrInput, signal?:AbortSignal):Promise<AsrResult>; cancel(runId:string):Promise<void> }
export interface OcrProvider { readiness():Promise<ProviderReadiness>; recognize(input:OcrInput, signal?:AbortSignal):Promise<OcrResult>; cancel(runId:string):Promise<void> }
export interface ProviderSet { asr:AsrProvider; ocr:OcrProvider }
export function parseAsrResult(input:unknown):AsrResult { const result=asrResultSchema.safeParse(input); if (!result.success||result.data.segments.some(s=>s.language!==null&&!['en','zh'].includes(s.language))) throw new AppError('INVALID_PROVIDER_OUTPUT','WhisperX returned invalid evidence.'); return result.data; }
export function parseOcrResult(input:unknown):OcrResult { const result=ocrResultSchema.safeParse(input); if (!result.success) throw new AppError('INVALID_PROVIDER_OUTPUT','PaddleOCR returned invalid evidence.'); return result.data; }
export class HttpProviders implements ProviderSet {
  readonly asr:AsrProvider; readonly ocr:OcrProvider;
  constructor(private readonly config:Config) {
    this.asr={readiness:()=>this.readiness('asr','whisperx'), transcribe:async(input,signal)=>parseAsrResult(await this.call('/asr',input,signal)),cancel:runId=>this.cancel(runId)};
    this.ocr={readiness:()=>this.readiness('ocr','paddleocr'), recognize:async(input,signal)=>parseOcrResult(await this.call('/ocr',input,signal)),cancel:runId=>this.cancel(runId)};
  }
  private async readiness(method:'asr'|'ocr',provider:string):Promise<ProviderReadiness> {
    try {
      const schema=z.object({asr:providerReadinessSchema,ocr:providerReadinessSchema});
      const data=schema.parse(await this.call('/readiness',undefined,AbortSignal.timeout(4000)));
      return data[method];
    } catch { return {provider,state:'UNAVAILABLE',version:null,model:null,message:'Local inference service or dependencies are unavailable. Configure the provider service; embedded extraction remains available.'}; }
  }
  private async cancel(runId:string) { try { await this.call(`/cancel/${runId}`,{},AbortSignal.timeout(2000)); } catch { /* Local cancellation still prevents evidence persistence. */ } }
  private async call(path:string,body?:unknown,signal?:AbortSignal):Promise<unknown> {
    if (!this.config.EXTRACTION_PROVIDER_TOKEN) throw new AppError('DEPENDENCY_UNAVAILABLE','Local inference service is not configured.');
    const abort=AbortSignal.any([AbortSignal.timeout(this.config.EXTRACTION_TIMEOUT_MS), ...(signal ? [signal] : [])]);
    try {
      const response=await fetch(this.config.EXTRACTION_PROVIDER_URL+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-Studio-Token':this.config.EXTRACTION_PROVIDER_TOKEN},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:abort});
      if (!response.body) throw new AppError('INVALID_PROVIDER_OUTPUT','Provider response was empty.');
      const chunks:Uint8Array[]=[]; let bytes=0;
      const reader=response.body.getReader();
      try { while(true) { const {done,value}=await reader.read(); if(done)break; bytes+=value.byteLength; if(bytes>16*1024*1024) { await reader.cancel(); throw new AppError('INVALID_PROVIDER_OUTPUT','Provider response exceeded its bound.'); } chunks.push(value); } }
      finally {reader.releaseLock();}
      let parsed:unknown; try { parsed=JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new AppError('INVALID_PROVIDER_OUTPUT','Provider response was unreadable.'); }
      if (!response.ok) {
        const failure=z.object({code:z.enum(['DEPENDENCY_UNAVAILABLE','MODEL_UNAVAILABLE','PROCESS_FAILED','OUT_OF_MEMORY','CANCELLED']),message:z.string().max(1000)}).safeParse(parsed);
        if (failure.success) throw new AppError(failure.data.code, 'Source provider could not complete the extraction. Check provider readiness and diagnostics.', 503);
        throw new AppError('PROCESS_FAILED','Local inference request failed.',503);
      }
      return parsed;
    } catch(error) {
      if(signal?.aborted) throw new AppError('CANCELLED','Source extraction was cancelled.');
      if(abort.aborted)throw new AppError('SOURCE_TIMEOUT','Local inference exceeded its configured time limit.',503);
      if(error instanceof AppError) throw error;
      throw new AppError('DEPENDENCY_UNAVAILABLE','Local inference service could not be reached.',503);
    }
  }
}
