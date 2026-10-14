import {z} from 'zod';
import {AppError} from '@mongolsub/domain';
import {localizationReasonSchema, localizationIssueCodeSchema} from '@mongolsub/contracts';
import {buildLocalizationPrompt} from './prompt';
import type {TranslationInput, TranslationProvider, TranslationResult, TranslationSegment} from './types';

const nullableText=z.string().trim().min(1).max(20000).nullable();
export const translationSegmentSchema=z.object({segmentId:z.string().min(1).max(200),translation:z.string().trim().min(1).max(20000),providerConfidence:z.number().min(0).max(1).nullable(),issues:z.array(localizationReasonSchema).max(30),alternativeTranslation:nullableText,suggestedLineBreak:nullableText}).strict();
const translationOutputSchema=z.object({segments:z.array(translationSegmentSchema).max(40)}).strict();
export function validateTargetIds(targetIds:readonly string[],segments:readonly TranslationSegment[]):TranslationSegment[] {
  const expected=new Set(targetIds);const seen=new Map<string,TranslationSegment>();
  for(const segment of segments){
    if(!expected.has(segment.segmentId))throw new AppError('LOCALIZATION_TARGET_UNKNOWN','Provider returned an unknown target identifier.',502);
    if(seen.has(segment.segmentId))throw new AppError('LOCALIZATION_TARGET_DUPLICATE','Provider returned a duplicate target identifier.',502);
    seen.set(segment.segmentId,segment);
  }
  if(seen.size!==expected.size)throw new AppError('LOCALIZATION_TARGET_MISSING','Provider response is missing a target identifier.',502);
  return targetIds.map(id=>seen.get(id)!);
}
export const LOCALIZATION_OUTPUT_JSON_SCHEMA={
  type:'object',additionalProperties:false,required:['segments'],properties:{segments:{type:'array',maxItems:40,items:{type:'object',additionalProperties:false,
    required:['segmentId','translation','providerConfidence','issues','alternativeTranslation','suggestedLineBreak'],properties:{
      segmentId:{type:'string'},translation:{type:'string'},providerConfidence:{type:['number','null'],minimum:0,maximum:1},
      issues:{type:'array',items:{type:'object',additionalProperties:false,required:['code','severity','message'],properties:{code:{type:'string',enum:localizationIssueCodeSchema.options},severity:{type:'string',enum:['INFO','REVIEW','SEVERE']},message:{type:'string'}}}},
      alternativeTranslation:{type:['string','null']},suggestedLineBreak:{type:['string','null']},
    },
  }}},
};
const responseEnvelopeSchema=z.object({
  status:z.enum(['completed','incomplete','failed','cancelled','queued','in_progress']),model:z.string().min(1).max(200),
  output:z.array(z.object({type:z.string(),content:z.array(z.object({type:z.string(),text:z.string().optional(),refusal:z.string().optional()}).passthrough()).optional()}).passthrough()).max(100),
  usage:z.object({input_tokens:z.number().int().nonnegative().optional(),output_tokens:z.number().int().nonnegative().optional(),input_tokens_details:z.object({cached_tokens:z.number().int().nonnegative().optional()}).passthrough().optional()}).passthrough().nullable().optional(),
}).passthrough();
const optionsSchema=z.object({
  apiKey:z.string().trim().min(1).max(1000),model:z.string().trim().min(1).max(200),
  baseUrl:z.string().url().default('https://api.openai.com/v1'),timeoutMs:z.number().int().min(1).max(600000).default(120000),
  maxOutputTokens:z.number().int().min(1).max(64000).default(12000),maxAttempts:z.number().int().min(1).max(3).default(2),retryBaseMs:z.number().int().min(1).max(10000).default(500),
}).strict().refine(v=>{const u=new URL(v.baseUrl);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&!u.search&&!u.hash;},'Use a server-configured HTTP endpoint without URL credentials.');
export interface OpenAiLocalizationOptions {apiKey:string;model:string;baseUrl?:string;timeoutMs?:number;maxOutputTokens?:number;maxAttempts?:number;retryBaseMs?:number}
const MAX_RESPONSE_BYTES=2*1024*1024;
function cancelled():AppError{return new AppError('LOCALIZATION_CANCELLED','Localization was cancelled.',409);}
function checkCancelled(signal?:AbortSignal){if(signal?.aborted)throw cancelled();}
async function delay(ms:number,signal?:AbortSignal){checkCancelled(signal);await new Promise<void>((resolve,reject)=>{const done=()=>{signal?.removeEventListener('abort',abort);resolve();};const timer=setTimeout(done,ms);const abort=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(cancelled());};signal?.addEventListener('abort',abort,{once:true});});}
async function readBounded(response:Response):Promise<string>{
  const declared=Number(response.headers.get('content-length'));
  if(declared>MAX_RESPONSE_BYTES)throw new AppError('LOCALIZATION_RESPONSE_TOO_LARGE','Provider response exceeded the safety limit.',502);
  if(!response.body)throw new AppError('LOCALIZATION_RESPONSE_INVALID','Provider returned an empty response.',502);
  const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>MAX_RESPONSE_BYTES){await reader.cancel();throw new AppError('LOCALIZATION_RESPONSE_TOO_LARGE','Provider response exceeded the safety limit.',502);}chunks.push(next.value);}}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}
function parseJson(text:string):unknown {try{return JSON.parse(text) as unknown;}catch{throw new AppError('LOCALIZATION_RESPONSE_INVALID','Provider returned invalid structured JSON.',502);}}
function validateMongolian(text:string):void {
  if(!/\p{Script=Cyrillic}/u.test(text)||/[\p{Script=Han}]/u.test(text)||[...text].some(c=>/\p{L}/u.test(c)&&! /\p{Script=Cyrillic}/u.test(c)))throw new AppError('LOCALIZATION_OUTPUT_LANGUAGE','Provider output must use Mongolian Cyrillic text.',502);
}
export class OpenAiLocalizationProvider implements TranslationProvider {
  private readonly options:ReturnType<typeof optionsSchema.safeParse>;
  constructor(options:OpenAiLocalizationOptions){this.options=optionsSchema.safeParse(options);}
  readiness(){return {status:this.options.success?'READY' as const:'MISCONFIGURED' as const,message:this.options.success?'Configured locally; account access has not been verified.':'Configure the server localization provider key, model and bounded request options.',provider:'openai-responses',model:this.options.success?this.options.data.model:''};}
  async localize(input:TranslationInput,signal?:AbortSignal):Promise<TranslationResult>{
    checkCancelled(signal);
    if(!this.options.success)throw new AppError('LOCALIZATION_PROVIDER_MISCONFIGURED','Configure the localization provider on the server.',503);
    const config=this.options.data;
    const ids=input.batch.targets.map(t=>t.id);
    if(input.phase==='REVIEW')validateTargetIds(ids,input.drafts??[]);
    const prompt=buildLocalizationPrompt(input);
    for(let attempt=1;attempt<=config.maxAttempts;attempt++){
      checkCancelled(signal);const controller=new AbortController();let timedOut=false;
      const timer=setTimeout(()=>{timedOut=true;controller.abort();},config.timeoutMs);
      const onAbort=()=>controller.abort();signal?.addEventListener('abort',onAbort,{once:true});
      try{
        const response=await fetch(`${config.baseUrl.replace(/\/$/,'')}/responses`,{method:'POST',headers:{authorization:`Bearer ${config.apiKey}`,'content-type':'application/json'},signal:controller.signal,body:JSON.stringify({model:config.model,store:false,max_output_tokens:config.maxOutputTokens,input:[{role:'system',content:prompt.system},{role:'user',content:prompt.user}],text:{format:{type:'json_schema',name:'mongolsub_localization',strict:true,schema:LOCALIZATION_OUTPUT_JSON_SCHEMA}}})});
        if(!response.ok){await response.body?.cancel();if(response.status===401||response.status===403)throw new AppError('LOCALIZATION_AUTH_FAILED','Localization provider authentication failed. Check the server credentials.',503);if(response.status===408||response.status===429||response.status>=500)throw new AppError('LOCALIZATION_PROVIDER_TRANSIENT','Localization provider is temporarily unavailable.',503,{httpStatus:response.status});throw new AppError('LOCALIZATION_REQUEST_REJECTED','Localization provider rejected the request. Check the server model and configuration.',502);}
        const envelope=responseEnvelopeSchema.safeParse(parseJson(await readBounded(response)));
        if(!envelope.success)throw new AppError('LOCALIZATION_RESPONSE_INVALID','Provider response did not match the expected envelope.',502);
        if(envelope.data.status!=='completed')throw new AppError('LOCALIZATION_INCOMPLETE','Provider did not complete the structured localization response.',502);
        const content=envelope.data.output.filter(o=>o.type==='message').flatMap(o=>o.content??[]);
        if(content.some(c=>c.type==='refusal'))throw new AppError('LOCALIZATION_REFUSED','Provider declined this localization request.',502);
        const texts=content.filter(c=>c.type==='output_text');
        if(texts.length!==1||!texts[0]?.text)throw new AppError('LOCALIZATION_RESPONSE_INVALID','Provider did not return one structured localization result.',502);
        const result=translationOutputSchema.safeParse(parseJson(texts[0].text));
        if(!result.success)throw new AppError('LOCALIZATION_RESPONSE_INVALID','Provider localization content did not match the schema.',502);
        const segments=validateTargetIds(ids,result.data.segments);
        for(const s of segments){validateMongolian(s.translation);if(s.alternativeTranslation)validateMongolian(s.alternativeTranslation);if(s.suggestedLineBreak)validateMongolian(s.suggestedLineBreak);}
        return {segments,model:envelope.data.model,providerVersion:envelope.data.model,usage:{inputTokens:envelope.data.usage?.input_tokens??null,outputTokens:envelope.data.usage?.output_tokens??null,cachedTokens:envelope.data.usage?.input_tokens_details?.cached_tokens??null}};
      }catch(error){
        if(signal?.aborted)throw cancelled();
        const failure=timedOut?new AppError('LOCALIZATION_TIMEOUT','Localization provider request timed out.',504):error instanceof AppError?error:new AppError('LOCALIZATION_NETWORK_FAILED','Unable to reach the localization provider.',503);
        const retry=['LOCALIZATION_TIMEOUT','LOCALIZATION_PROVIDER_TRANSIENT','LOCALIZATION_NETWORK_FAILED'].includes(failure.code);
        if(!retry||attempt===config.maxAttempts)throw failure;
        await delay(config.retryBaseMs*2**(attempt-1),signal);
      }finally{clearTimeout(timer);signal?.removeEventListener('abort',onAbort);}
    }
    throw new AppError('LOCALIZATION_PROVIDER_UNAVAILABLE','Localization provider is unavailable.',503);
  }
}
