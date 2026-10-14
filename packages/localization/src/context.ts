import {AppError} from '@mongolsub/domain';
import type {LocalizationSettings} from '@mongolsub/contracts';
import type {LocalizationBatch, LocalizationSnapshot, LocalizationSource} from './types';

export function normalizeMemorySource(text:string):string {return text.normalize('NFKC').replace(/\s+/gu,' ').trim().toLocaleLowerCase('en');}
function mentions(text:string,term:string,caseSensitive=false):boolean {
  if(!term.trim())return false;
  const haystack=caseSensitive?text:text.toLocaleLowerCase('en');const needle=caseSensitive?term:term.toLocaleLowerCase('en');
  const escaped=needle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return [...needle].every(character=>(character.codePointAt(0)??128)<=127)?new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`,'u').test(haystack):haystack.includes(needle);
}
function makeBatch(sources:readonly LocalizationSource[],start:number,size:number,snapshot:LocalizationSnapshot,settings:LocalizationSettings,before:number,after:number):LocalizationBatch {
  const targets=sources.slice(start,start+size);const contextBefore=sources.slice(Math.max(0,start-before),start);const contextAfter=sources.slice(start+size,start+size+after);
  const relevant=[...contextBefore,...targets,...contextAfter];const text=relevant.map(s=>s.text).join('\n');
  const speakers=new Set(relevant.map(s=>s.speaker).filter(s=>s!==null));
  const speakerBindings=settings.speakerBindings.filter(b=>speakers.has(b.speaker));
  const boundIds=new Set(speakerBindings.map(b=>b.characterId));
  const characters=snapshot.characters.filter(c=>c.seriesId===snapshot.seriesId&&(boundIds.has(c.id)||[c.canonicalName,c.sourceName,...c.aliases.map(a=>a.alias)].some(n=>mentions(text,n))));
  const characterIds=new Set(characters.map(c=>c.id));
  const relationships=snapshot.relationships.filter(r=>r.seriesId===snapshot.seriesId&&characterIds.has(r.fromCharacterId)&&characterIds.has(r.toCharacterId));
  const priority={GLOBAL:0,SERIES:1,EPISODE:2,CHARACTER:3};
  const glossaryCandidates=snapshot.glossary.filter(g=>g.status==='ACTIVE'&&g.sourceLanguage===snapshot.sourceLanguage&&mentions(text,g.sourceTerm,g.caseSensitive)&&(g.scope==='GLOBAL'||(g.seriesId===snapshot.seriesId&&(g.scope==='SERIES'||(g.scope==='EPISODE'&&g.episodeId===snapshot.episodeId)||(g.scope==='CHARACTER'&&g.characterId!==null&&boundIds.has(g.characterId))))));
  const glossaryMap=new Map<string,LocalizationSnapshot['glossary'][number]>();
  for(const g of glossaryCandidates){const key=g.sourceTerm.toLocaleLowerCase('en');const previous=glossaryMap.get(key);if(!previous||priority[g.scope]>priority[previous.scope])glossaryMap.set(key,g);}
  const glossary=[...glossaryMap.values()];
  const targetText=new Set(targets.map(s=>normalizeMemorySource(s.text)));
  const translationMemory=snapshot.translationMemory.filter(m=>m.seriesId===snapshot.seriesId&&m.sourceLanguage===snapshot.sourceLanguage&&m.status==='TRUSTED'&&m.origin!=='AI_SUGGESTED'&&targetText.has(normalizeMemorySource(m.sourceText))&&m.normalizedSourceText===normalizeMemorySource(m.sourceText)&&(m.characterId===null||boundIds.has(m.characterId)));
  const first=targets[0]?.sequence??0;
  const previousApprovedLines=snapshot.previousApprovedLines.filter(l=>l.fusionRunId===snapshot.fusionRunId&&l.sequence<first).sort((a,b)=>a.sequence-b.sequence).slice(-before);
  const payload={targets,contextBefore,contextAfter,profile:snapshot.profile,characters,relationships,glossary,translationMemory,previousApprovedLines,speakerBindings};
  // Bound actual serialized request data, including IDs and memory, rather than only source text.
  const characterBudgetUsed=JSON.stringify(payload).length;
  return {...payload,characterBudgetUsed,estimatedInputTokens:Math.ceil(characterBudgetUsed/3)};
}
export function buildContextBatches(input:readonly LocalizationSource[],snapshot:LocalizationSnapshot,settings:LocalizationSettings):LocalizationBatch[] {
  const sources=[...input].sort((a,b)=>a.sequence-b.sequence);
  if(new Set(sources.map(s=>s.id)).size!==sources.length||new Set(sources.map(s=>s.sequence)).size!==sources.length)throw new AppError('LOCALIZATION_SOURCE_INVALID','Localization source identifiers and sequences must be unique.');
  const batches:LocalizationBatch[]=[];
  for(let start=0;start<sources.length;){
    let size=Math.min(settings.batchSize,sources.length-start);let before=settings.contextBefore;let after=settings.contextAfter;
    let batch=makeBatch(sources,start,size,snapshot,settings,before,after);
    while(batch.characterBudgetUsed>settings.maxContextCharacters){
      if(size>1)size--;else if(before>0)before--;else if(after>0)after--;else throw new AppError('LOCALIZATION_CONTEXT_BUDGET','A complete source segment and its selected memory exceed the context budget. Increase the budget or shorten memory explicitly.');
      batch=makeBatch(sources,start,size,snapshot,settings,before,after);
    }
    batches.push(batch);start+=size;
  }
  return batches;
}
