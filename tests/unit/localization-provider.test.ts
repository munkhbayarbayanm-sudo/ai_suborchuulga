import {afterEach, describe, expect, it, vi} from 'vitest';
import {OpenAiLocalizationProvider, buildContextBatches, validateTargetIds, type TranslationInput} from '../../packages/localization/src/index';
import {localizationSettingsSchema} from '../../packages/contracts/src/localization';
const output={segments:[{segmentId:'s0',translation:'Би ирэхгүй.',providerConfidence:0.9,issues:[],alternativeTranslation:null,suggestedLineBreak:null}]};
const input=():TranslationInput=>({phase:'DRAFT',mode:'NATURAL',sourceLanguage:'en',batch:buildContextBatches([{id:'s0',sequence:0,text:'I will not come.',startMs:0,endMs:2000,speaker:null,confidence:0.9,reviewCategory:'HIGH_CONFIDENCE',reviewStatus:'APPROVED',editRevision:0}],{seriesId:'series',episodeId:'episode',fusionRunId:'fusion',sourceLanguage:'en',profile:{defaultMode:'NATURAL',generalTone:'',setting:'',preferredStyle:'',formalityGuidance:'',nameHandling:'',specialNotes:''},characters:[],relationships:[],glossary:[],translationMemory:[],previousApprovedLines:[]},localizationSettingsSchema.parse({}))[0]!});
const envelope=(value:unknown=output)=>({status:'completed',model:'model-actual',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}],usage:{input_tokens:20,output_tokens:10,input_tokens_details:{cached_tokens:5}}});
const provider=()=>new OpenAiLocalizationProvider({apiKey:'test-only-key',model:'model-requested',baseUrl:'https://api.example.test/v1',timeoutMs:100,maxOutputTokens:1000,maxAttempts:3,retryBaseMs:1});
afterEach(()=>vi.unstubAllGlobals());
describe('OpenAI Responses localization boundary with fake HTTP only',()=>{
  it('reports configuration readiness without contacting the account',()=>{const fetch=vi.fn();vi.stubGlobal('fetch',fetch);expect(provider().readiness().status).toBe('READY');expect(new OpenAiLocalizationProvider({apiKey:'',model:''}).readiness().status).toBe('MISCONFIGURED');expect(fetch).not.toHaveBeenCalled();});
  it('uses strict Responses format and store false, reports actual model and actual usage',async()=>{
    const fetch=vi.fn(async(_url:unknown,_options?:RequestInit)=>new Response(JSON.stringify(envelope())));vi.stubGlobal('fetch',fetch);
    const result=await provider().localize(input());expect(result.model).toBe('model-actual');expect(result.usage).toEqual({inputTokens:20,outputTokens:10,cachedTokens:5});
    const body=JSON.parse(fetch.mock.calls[0]?.[1]?.body as string);expect(body.store).toBe(false);expect(body.text.format.type).toBe('json_schema');expect(body.text.format.strict).toBe(true);expect(body.input[0].role).toBe('system');
  });
  it('reorders target results and rejects missing, duplicate and unknown IDs distinctly',()=>{
    const row=output.segments[0]!;expect(validateTargetIds(['a','b'],[{...row,segmentId:'b'},{...row,segmentId:'a'}]).map(s=>s.segmentId)).toEqual(['a','b']);
    expect(()=>validateTargetIds(['a'],[])).toThrow(/missing/i);expect(()=>validateTargetIds(['a'],[{...row,segmentId:'a'},{...row,segmentId:'a'}])).toThrow(/duplicate/i);expect(()=>validateTargetIds(['a'],[{...row,segmentId:'x'}])).toThrow(/unknown/i);
  });
  it('retries only bounded transient HTTP failures',async()=>{let attempts=0;vi.stubGlobal('fetch',async()=>++attempts<3?new Response('private',{status:429}):new Response(JSON.stringify(envelope())));await provider().localize(input());expect(attempts).toBe(3);});
  it('does not retry authentication errors or expose provider bodies',async()=>{const fetch=vi.fn(async()=>new Response('SECRET',{status:401}));vi.stubGlobal('fetch',fetch);await expect(provider().localize(input())).rejects.toMatchObject({code:'LOCALIZATION_AUTH_FAILED'});expect(fetch).toHaveBeenCalledTimes(1);});
  it.each([
    [{status:'incomplete',output:[],model:'m'},'LOCALIZATION_INCOMPLETE'],
    [{status:'completed',model:'m',output:[{type:'message',content:[{type:'refusal',refusal:'private text'}]}]},'LOCALIZATION_REFUSED'],
    [envelope({segments:[{...output.segments[0],translation:'你好'}]}),'LOCALIZATION_OUTPUT_LANGUAGE'],
    [envelope({segments:[{...output.segments[0],translation:'I will not come.'}]}),'LOCALIZATION_OUTPUT_LANGUAGE'],
    [envelope({segments:[{...output.segments[0],unexpected:'x'}]}),'LOCALIZATION_RESPONSE_INVALID'],
  ])('rejects malformed, refused and wrong-script outputs without blind retry',async(value,code)=>{const fetch=vi.fn(async()=>new Response(JSON.stringify(value)));vi.stubGlobal('fetch',fetch);await expect(provider().localize(input())).rejects.toMatchObject({code});expect(fetch).toHaveBeenCalledTimes(1);});
  it('bounds response bytes including chunked response bodies',async()=>{vi.stubGlobal('fetch',async()=>new Response('x'.repeat(2*1024*1024+1)));await expect(provider().localize(input())).rejects.toMatchObject({code:'LOCALIZATION_RESPONSE_TOO_LARGE'});});
  it('times out with bounded attempts and accepts caller cancellation',async()=>{
    let attempts=0;vi.stubGlobal('fetch',async(_url:unknown,options:RequestInit)=>{attempts++;return new Promise<Response>((_resolve,reject)=>options.signal?.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')),{once:true}));});
    const p=new OpenAiLocalizationProvider({apiKey:'test',model:'m',timeoutMs:20,maxAttempts:2,retryBaseMs:1});await expect(p.localize(input())).rejects.toMatchObject({code:'LOCALIZATION_TIMEOUT'});expect(attempts).toBe(2);
    const abort=new AbortController();abort.abort();await expect(p.localize(input(),abort.signal)).rejects.toMatchObject({code:'LOCALIZATION_CANCELLED'});expect(attempts).toBe(2);
  });
});
