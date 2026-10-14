import {describe, expect, it} from 'vitest';
import {localizationSettingsSchema, localizationRequestSchema} from '../../packages/contracts/src/localization';
import {assessLocalization, assertLocalizationRequestBudget, buildContextBatches, buildLocalizationPrompt, normalizeMemorySource, type LocalizationSnapshot, type LocalizationSource} from '../../packages/localization/src/index';

const source = (sequence: number, text='Hello.'): LocalizationSource => ({id:`s${sequence}`,sequence,text,startMs:sequence*2000,endMs:sequence*2000+1500,speaker:null,confidence:0.95,reviewCategory:'HIGH_CONFIDENCE',reviewStatus:'APPROVED',editRevision:0});
const snapshot = (): LocalizationSnapshot => ({seriesId:'series',episodeId:'episode',fusionRunId:'fusion',sourceLanguage:'en',profile:{defaultMode:'NATURAL',generalTone:'',setting:'',preferredStyle:'',formalityGuidance:'',nameHandling:'',specialNotes:''},characters:[],relationships:[],glossary:[],translationMemory:[],previousApprovedLines:[]});

describe('localization contracts and contextual engine',()=>{
  it('defaults to natural and validates bounded contextual settings',()=>{
    expect(localizationRequestSchema.parse({fusionRunId:'00000000-0000-4000-8000-000000000001'}).mode).toBe('NATURAL');
    expect(localizationSettingsSchema.parse({}).batchSize).toBe(20);
    expect(localizationSettingsSchema.safeParse({batchSize:41}).success).toBe(false);
    expect(localizationSettingsSchema.safeParse({contextBefore:2}).success).toBe(false);
  });
  it('retains every target exactly once with adjacent context and immutable inputs',()=>{
    const sources=Array.from({length:45},(_,i)=>source(i));const frozen=JSON.stringify(sources);
    const batches=buildContextBatches(sources,snapshot(),localizationSettingsSchema.parse({}));
    expect(batches.map(b=>b.targets.length)).toEqual([20,20,5]);
    expect(batches[1]?.contextBefore.map(s=>s.sequence)).toEqual([15,16,17,18,19]);
    expect(batches[1]?.contextAfter.map(s=>s.sequence)).toEqual([40,41,42,43,44]);
    expect(batches.flatMap(b=>b.targets.map(s=>s.id))).toEqual(sources.map(s=>s.id));
    expect(JSON.stringify(sources)).toBe(frozen);
  });
  it('shrinks batches without truncating text and rejects an individually oversized source',()=>{
    const settings=localizationSettingsSchema.parse({maxContextCharacters:1000});
    const batches=buildContextBatches(Array.from({length:8},(_,i)=>source(i,'A'.repeat(180))),snapshot(),settings);
    expect(batches.flatMap(b=>b.targets).length).toBe(8);
    expect(batches.every(b=>b.characterBudgetUsed<=1000)).toBe(true);
    expect(()=>buildContextBatches([source(0,'A'.repeat(1200))],snapshot(),settings)).toThrow(/budget/i);
  });
  it('uses scoped glossary priority and only exact trusted memories without anonymous mapping',()=>{
    const memory=snapshot();
    memory.characters=[{id:'00000000-0000-4000-8000-000000000001',seriesId:'series',canonicalName:'King',sourceName:'Arthur',mongolianName:'Артур',role:'king',title:'',speakingStyle:'formal',formality:'formal',notes:'',aliases:[]}];
    memory.glossary=['GLOBAL','SERIES','EPISODE','CHARACTER'].map((scope,i)=>({id:`g${i}`,scope:scope as 'GLOBAL'|'SERIES'|'EPISODE'|'CHARACTER',seriesId:scope==='GLOBAL'?null:'series',episodeId:scope==='EPISODE'?'episode':null,characterId:scope==='CHARACTER'?'00000000-0000-4000-8000-000000000001':null,sourceLanguage:'en',sourceTerm:'Your Majesty',preferredMongolian:`нэр${i}`,notes:'contextual',caseSensitive:false,status:'ACTIVE'}));
    memory.translationMemory=[{id:'tm',seriesId:'series',sourceLanguage:'en',sourceText:'Your Majesty',normalizedSourceText:normalizeMemorySource('Your Majesty'),mongolianText:'Эрхэм дээдэс',characterId:null,origin:'HUMAN_APPROVED',status:'TRUSTED',sourceLocalizedSegmentId:null,sourceRevision:null}];
    const unbound=buildContextBatches([source(0,'Your Majesty')],memory,localizationSettingsSchema.parse({}))[0]!;
    expect(unbound.characters).toEqual([]);expect(unbound.glossary[0]?.id).toBe('g2');expect(unbound.translationMemory).toHaveLength(1);
    const bound=buildContextBatches([{...source(0,'Your Majesty'),speaker:'SPEAKER_00'}],memory,localizationSettingsSchema.parse({speakerBindings:[{speaker:'SPEAKER_00',characterId:'00000000-0000-4000-8000-000000000001'}]}))[0]!;
    expect(bound.glossary[0]?.id).toBe('g3');expect(bound.characters[0]?.id).toBe('00000000-0000-4000-8000-000000000001');
    memory.translationMemory[0]!.status='SUGGESTED';
    expect(buildContextBatches([source(0,'Your Majesty')],memory,localizationSettingsSchema.parse({}))[0]?.translationMemory).toEqual([]);
  });
  it('distinguishes modes and editorial phase and treats all memory as untrusted data',()=>{
    const batch=buildContextBatches([source(0,'Seriously? Leave me.')],snapshot(),localizationSettingsSchema.parse({}))[0]!;
    for(const mode of ['STRICT','NATURAL','CINEMATIC'] as const){const p=buildLocalizationPrompt({phase:'REVIEW',mode,sourceLanguage:'en',batch,drafts:[]});expect(p.system).toContain(mode);expect(p.system).toContain('untrusted');expect(p.system).toContain('negation');expect(p.system).toContain('Seriously');}
    expect(buildLocalizationPrompt({phase:'DRAFT',mode:'NATURAL',sourceLanguage:'en',batch}).system).toContain('DRAFT');
  });
  it('bounds the complete provider request including review drafts and prompt instructions',()=>{
    const batch=buildContextBatches([source(0,'Hello.')],snapshot(),localizationSettingsSchema.parse({}))[0]!;
    const review={phase:'REVIEW' as const,mode:'NATURAL' as const,sourceLanguage:'en' as const,batch,drafts:[{segmentId:'s0',translation:'А'.repeat(5000),providerConfidence:0.8,issues:[],alternativeTranslation:null,suggestedLineBreak:null}]};
    expect(()=>assertLocalizationRequestBudget(review,4000)).toThrow(/budget/i);
    expect(()=>assertLocalizationRequestBudget(review,12000)).not.toThrow();
  });
  it('forces fidelity issues and risky sources into human review without approving them',()=>{
    const result=assessLocalization(source(0,"I do not have 2 crowns."),{segmentId:'s0',translation:'Би титэмтэй.',providerConfidence:0.99,issues:[],alternativeTranslation:null,suggestedLineBreak:null},[]);
    expect(result.reviewClassification).toBe('REVIEW_RECOMMENDED');expect(result.reasons.map(r=>r.code)).toContain('NUMBER_MISMATCH');expect(result.reasons.map(r=>r.code)).toContain('NEGATION_UNCERTAIN');
    const severe=assessLocalization(source(0),{segmentId:'s0',translation:'Сайн байна.',providerConfidence:1,issues:[{code:'INVENTED_FACT',severity:'SEVERE',message:'Invented relationship.'}],alternativeTranslation:null,suggestedLineBreak:null},[]);
    expect(severe.reviewClassification).toBe('LIKELY_PROBLEM');
    const unsafe=assessLocalization({...source(0),reviewCategory:'LIKELY_PROBLEM'}, {segmentId:'s0',translation:'Сайн байна.',providerConfidence:1,issues:[],alternativeTranslation:null,suggestedLineBreak:null},[]);
    expect(unsafe.reviewClassification).toBe('LIKELY_PROBLEM');
  });
  it('flags a missing approved character name only when that name appears in the source',()=>{
    const character={id:'c1',seriesId:'series',canonicalName:'Li Wei',sourceName:'Li Wei',mongolianName:'Ли Вэй',role:'',title:'',speakingStyle:'',formality:'',notes:'',aliases:[{id:'a1',alias:'General Li'}]};
    const proposal={segmentId:'s0',translation:'Жанжин ирлээ.',providerConfidence:0.95,issues:[],alternativeTranslation:null,suggestedLineBreak:null};
    expect(assessLocalization(source(0,'General Li arrived.'),proposal,[],[character]).reasons.map(reason=>reason.code)).toContain('NAME_UNCERTAIN');
    expect(assessLocalization(source(0,'The general arrived.'),proposal,[],[character]).reasons.map(reason=>reason.code)).not.toContain('NAME_UNCERTAIN');
    expect(assessLocalization(source(0,'General Li arrived.'),{...proposal,translation:'Ли Вэй жанжин ирлээ.'},[],[character]).reasons.map(reason=>reason.code)).not.toContain('NAME_UNCERTAIN');
  });
});
