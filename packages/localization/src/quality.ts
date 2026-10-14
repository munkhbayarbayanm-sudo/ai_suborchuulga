import type {LocalizationReason,ReviewCategory} from '@mongolsub/contracts';
import type {LocalizationSnapshot, LocalizationSource, TranslationSegment} from './types';

function sourceMentionsName(source:string,name:string):boolean {
  if(!name.trim())return false;
  const haystack=source.normalize('NFKC').toLocaleLowerCase('en');
  const needle=name.normalize('NFKC').toLocaleLowerCase('en');
  const escaped=needle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return [...needle].every(character=>(character.codePointAt(0)??128)<=127)?new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`,'u').test(haystack):haystack.includes(needle);
}
export function assessLocalization(source:LocalizationSource,result:TranslationSegment,glossary:LocalizationSnapshot['glossary'],characters:LocalizationSnapshot['characters']=[]) {
  const reasons:LocalizationReason[]=[...result.issues];
  const add=(code:LocalizationReason['code'],message:string)=>reasons.push({code,severity:'REVIEW',message});
  if(source.reviewCategory!=='HIGH_CONFIDENCE'||source.confidence<0.85)add('SOURCE_UNCERTAIN','Source transcript uncertainty remains independent of translation confidence.');
  const numbers=source.text.match(/\d+(?:[.,]\d+)*/g)??[];
  if(numbers.some(n=>!result.translation.includes(n)))add('NUMBER_MISMATCH','A source numeral is absent in the Mongolian proposal; check equivalent written numbers.');
  if(/\b(?:not|never|no|cannot|can't|won't|don't|isn't|wasn't)\b|不|没|沒|无|無|未/u.test(source.text.toLowerCase())&&!/(?:гүй|биш|үгүй|огт|бүү|битгий|болих|байгаагүй)/u.test(result.translation))add('NEGATION_UNCERTAIN','Source negation has no recognizable Mongolian negation cue; verify meaning manually.');
  for(const g of glossary) {
    const sourceText=g.caseSensitive?source.text:source.text.toLocaleLowerCase('en');
    const term=g.caseSensitive?g.sourceTerm:g.sourceTerm.toLocaleLowerCase('en');
    if(sourceText.includes(term)&&!result.translation.toLocaleLowerCase('mn').includes(g.preferredMongolian.toLocaleLowerCase('mn')))add('GLOSSARY_UNCERTAIN',`Check the contextual glossary preference for ${g.sourceTerm}. Inflection may be valid.`);
  }
  for(const character of characters) {
    const sourceNames=[character.sourceName,character.canonicalName,...character.aliases.map(alias=>alias.alias)];
    if(character.mongolianName&&sourceNames.some(name=>sourceMentionsName(source.text,name))&&!result.translation.normalize('NFKC').toLocaleLowerCase('mn').includes(character.mongolianName.normalize('NFKC').toLocaleLowerCase('mn')))add('NAME_UNCERTAIN',`Check the approved Mongolian name for ${character.sourceName || character.canonicalName}. Inflection may be valid.`);
  }
  if(result.providerConfidence===null)add('PROVIDER_CONFIDENCE_MISSING','Provider did not supply subjective confidence.');
  const characterCount=[...result.translation.replace(/\s/gu,'')].length;
  const readingLoad=characterCount/Math.max(0.001,(source.endMs-source.startMs)/1000);
  if(readingLoad>25)add('READING_LOAD','Proposal exceeds 25 non-space characters per source second; this is a readability hint, not a timing edit.');
  const severe=reasons.some(r=>r.severity==='SEVERE');const review=reasons.some(r=>r.severity==='REVIEW');
  const base=Math.min(source.confidence,result.providerConfidence??0.7);
  const confidence=Math.max(0,Math.min(1,base-(severe?0.45:review?0.15:0)));
  const reviewClassification:ReviewCategory=severe||source.reviewCategory==='LIKELY_PROBLEM'||confidence<0.5?'LIKELY_PROBLEM':review||confidence<0.85?'REVIEW_RECOMMENDED':'HIGH_CONFIDENCE';
  return {confidence,providerConfidence:result.providerConfidence,confidenceReasons:reasons,reasons,reviewClassification,characterCount,readingLoad};
}
export const assessQuality=assessLocalization;
