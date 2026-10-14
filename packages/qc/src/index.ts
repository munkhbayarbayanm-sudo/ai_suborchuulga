import {createHash} from 'node:crypto';

export const QC_ENGINE_VERSION='subtitle-qc-v1';
export const QC_AI_PROMPT_VERSION='subtitle-qc-ai-v1';

export type QCIssueSeverity='INFO'|'WARNING'|'ERROR';
export type QCIssueCategory='TIMING'|'READABILITY'|'LANGUAGE'|'TRANSLATION'|'CONSISTENCY';
export type QCIssueType=
  |'OUTSIDE_MEDIA'|'VERY_SHORT'|'VERY_LONG'|'OVERLAP'|'MINIMUM_GAP'|'TIMING_ORDER'|'DENSE_CLUSTER'
  |'EMPTY_TEXT'|'READING_SPEED'|'LINE_COUNT'|'LINE_LENGTH'|'AWKWARD_LINE_BREAK'|'WHITESPACE'|'DUPLICATE_CUE'|'REPEATED_PUNCTUATION'
  |'UNTRANSLATED_SOURCE'|'MIXED_LANGUAGE'|'NEGATION_RISK'|'NUMBER_MISMATCH'
  |'NAME_INCONSISTENT'|'GLOSSARY_INCONSISTENT'|'ADDRESS_SHIFT'|'SERIES_NAME_DRIFT'|'SERIES_GLOSSARY_DRIFT'
  |'AI_MEANING_RISK'|'AI_NATURALNESS'|'AI_CONTEXT_UNCERTAIN';
export type QCSuggestion=
  |{type:'UPDATE_TEXT';text:string}
  |{type:'RESIZE_START';startMs:number}
  |{type:'RESIZE_END';endMs:number}
  |{type:'SPLIT_CUE';splitMs:number};
export interface QCProfileSettings{
  minimumCueDurationMs:number;maximumCueDurationMs:number;maximumCharactersPerSecond:number;
  maximumLineCount:number;maximumCharactersPerLine:number;minimumGapMs:number;allowOverlaps:boolean;
  denseClusterWindowMs:number;denseClusterCueCount:number;untranslatedDetection:boolean;aiMode:'OFF'|'PROBLEMATIC_ONLY'|'ALL';
}
export const DEFAULT_QC_PROFILE:Readonly<QCProfileSettings>={minimumCueDurationMs:500,maximumCueDurationMs:10_000,maximumCharactersPerSecond:22,maximumLineCount:2,maximumCharactersPerLine:42,minimumGapMs:80,allowOverlaps:false,denseClusterWindowMs:2_000,denseClusterCueCount:3,untranslatedDetection:true,aiMode:'OFF'};
export interface QCCue{
  id:string;documentId:string;episodeId:string;sequence:number;startMs:number;endMs:number;text:string;
  origin:string;speaker:string|null;sourceTexts:string[];sourceLanguage:'en'|'zh'|null;sourceReviewClassification:string|null;
}
export interface QCCharacter{id:string;sourceNames:string[];mongolianName:string}
export interface QCGlossaryTerm{id:string;sourceTerm:string;preferredMongolian:string}
export interface QCIssueCandidate{
  type:QCIssueType;category:QCIssueCategory;severity:QCIssueSeverity;cueIds:string[];title:string;explanation:string;
  metrics:Record<string,unknown>;suggestions:QCSuggestion[];fingerprint:string;
}
interface FingerprintInput{type:QCIssueType;cueIds:string[];evidence:unknown}
const normalize=(value:string)=>value.normalize('NFKC').toLocaleLowerCase('mn').replace(/[\s\p{P}\p{S}]+/gu,'').trim();
const visibleCharacters=(value:string)=>[...value.replace(/\s/gu,'')].length;
const normalizedWords=(value:string)=>value.normalize('NFKC').toLocaleLowerCase('mn').match(/[\p{L}\p{N}]+/gu)??[];
const sourceText=(cue:QCCue)=>cue.sourceTexts.join('\n');
const includesNormalized=(value:string,needle:string)=>normalize(value).includes(normalize(needle));
export function issueFingerprint(input:FingerprintInput):string{return createHash('sha256').update(JSON.stringify({type:input.type,cueIds:[...input.cueIds].sort(),evidence:input.evidence})).digest('hex');}
function makeIssue(type:QCIssueType,category:QCIssueCategory,severity:QCIssueSeverity,cues:QCCue[],title:string,explanation:string,metrics:Record<string,unknown>={},suggestions:QCSuggestion[]=[]):QCIssueCandidate{
  const cueIds=cues.map(cue=>cue.id);return{type,category,severity,cueIds,title,explanation,metrics,suggestions,fingerprint:issueFingerprint({type,cueIds,evidence:{metrics,text:cues.map(cue=>cue.text),timing:cues.map(cue=>[cue.startMs,cue.endMs])}})};
}
const hasMongolian=(value:string)=>/[А-ЯӨҮЁа-яөүё]/u.test(value);
const hasChinese=(value:string)=>/[\u3400-\u9fff]/u.test(value);
const englishWords=(value:string)=>value.match(/\b[A-Za-z][A-Za-z']{2,}\b/g)??[];
const allowedLatin=new Set(['api','tv','dvd','usb','vip','sms','gps','ai']);
const significantEnglish=(value:string)=>englishWords(value).filter(word=>!allowedLatin.has(word.toLowerCase())&&word!==word.toUpperCase());
const negativeSource=(value:string)=>/\b(?:not|never|no|cannot|can't|won't|don't|isn't|wasn't)\b|不|没|沒|无|無|未/iu.test(value);
const negativeMongolian=(value:string)=>/(?:гүй|биш|үгүй|огт|бүү|битгий|болих|байгаагүй|явахгүй)/u.test(value);
const numberTokens=(value:string)=>{
  const dictionary:Record<string,string>={one:'1',two:'2',three:'3',four:'4',five:'5',нэг:'1',хоёр:'2',гурав:'3',дөрөв:'4',тав:'5'};
  return new Set(normalizedWords(value).map(word=>dictionary[word]??word).filter(word=>/^\d+(?:[.,]\d+)?$/u.test(word)));
};
const editDistance=(left:string,right:string)=>{const a=[...left],b=[...right],row=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){let prior=row[0]!;row[0]=i;for(let j=1;j<=b.length;j++){const saved=row[j]!;row[j]=Math.min(row[j]!+1,row[j-1]!+1,prior+(a[i-1]===b[j-1]?0:1));prior=saved;}}return row[b.length]!;};
function likelyNameVariant(text:string,preferred:string){const target=normalize(preferred);if(!target)return false;return normalizedWords(text).some((_,index,words)=>{for(let size=1;size<=Math.min(3,words.length-index);size++){const candidate=normalize(words.slice(index,index+size).join(' '));if(candidate!==target&&Math.abs(candidate.length-target.length)<=1&&editDistance(candidate,target)<=1)return true;}return false;});}
function cleanedWhitespace(text:string){return text.split('\n').map(line=>line.trim().replace(/[ \t]{2,}/gu,' ')).join('\n').trim();}

export function runDocumentQc(input:{documentId:string;mediaDurationMs:number;profile:QCProfileSettings;cues:QCCue[];characters:QCCharacter[];glossary:QCGlossaryTerm[]}){
  const cues=[...input.cues].sort((a,b)=>a.sequence-b.sequence||a.startMs-b.startMs||a.id.localeCompare(b.id));const issues:QCIssueCandidate[]=[];
  for(let index=0;index<cues.length;index++){
    const cue=cues[index]!;const duration=cue.endMs-cue.startMs;const lines=cue.text.split('\n');const cps=visibleCharacters(cue.text)/Math.max(.001,duration/1000);const source=sourceText(cue);
    if(cue.startMs<0||cue.endMs<=cue.startMs||cue.endMs>input.mediaDurationMs)issues.push(makeIssue('OUTSIDE_MEDIA','TIMING','ERROR',[cue],'Invalid media timing','Cue timing falls outside the playable media timeline.',{startMs:cue.startMs,endMs:cue.endMs,mediaDurationMs:input.mediaDurationMs}));
    if(duration>0&&duration<input.profile.minimumCueDurationMs)issues.push(makeIssue('VERY_SHORT','TIMING','WARNING',[cue],'Cue is very short','The cue may disappear before it can be read.',{durationMs:duration,minimumMs:input.profile.minimumCueDurationMs},[{type:'RESIZE_END',endMs:cue.startMs+input.profile.minimumCueDurationMs}]));
    if(duration>input.profile.maximumCueDurationMs)issues.push(makeIssue('VERY_LONG','TIMING','WARNING',[cue],'Cue is unusually long','Review whether this cue should be split or retimed.',{durationMs:duration,maximumMs:input.profile.maximumCueDurationMs}));
    if(!cue.text.trim())issues.push(makeIssue('EMPTY_TEXT','READABILITY','ERROR',[cue],'Empty subtitle','The cue has no visible subtitle text.'));
    if(cue.text.trim()&&cps>input.profile.maximumCharactersPerSecond)issues.push(makeIssue('READING_SPEED','READABILITY','WARNING',[cue],'Reading speed is high','The measured non-space character load exceeds this profile.',{charactersPerSecond:Number(cps.toFixed(2)),maximumCharactersPerSecond:input.profile.maximumCharactersPerSecond}));
    if(lines.length>input.profile.maximumLineCount)issues.push(makeIssue('LINE_COUNT','READABILITY','WARNING',[cue],'Too many subtitle lines','The cue exceeds the configured line-count guidance.',{lineCount:lines.length,maximumLineCount:input.profile.maximumLineCount}));
    if(lines.some(line=>[...line].length>input.profile.maximumCharactersPerLine))issues.push(makeIssue('LINE_LENGTH','READABILITY','WARNING',[cue],'Subtitle line is long','At least one line exceeds the configured character guidance.',{longestLineCharacters:Math.max(...lines.map(line=>[...line].length)),maximumCharactersPerLine:input.profile.maximumCharactersPerLine}));
    if(lines.slice(1).some(line=>/^\s*[\p{P}\p{S}]\s*$/u.test(line)||visibleCharacters(line)===1))issues.push(makeIssue('AWKWARD_LINE_BREAK','READABILITY','INFO',[cue],'Awkward line break','A punctuation mark or one-character orphan appears on its own line.'));
    const cleaned=cleanedWhitespace(cue.text);if(cleaned!==cue.text)issues.push(makeIssue('WHITESPACE','READABILITY','INFO',[cue],'Whitespace cleanup','Leading, trailing or repeated spaces were detected.',{},[{type:'UPDATE_TEXT',text:cleaned}]));
    if(/([!?.,…])\1{2,}/u.test(cue.text))issues.push(makeIssue('REPEATED_PUNCTUATION','READABILITY','INFO',[cue],'Repeated punctuation','Review whether the punctuation repetition is intentional.'));
    if(input.profile.untranslatedDetection){const latin=significantEnglish(cue.text);if((latin.length>=3&&!hasMongolian(cue.text))||hasChinese(cue.text))issues.push(makeIssue('UNTRANSLATED_SOURCE','LANGUAGE','ERROR',[cue],'Possible untranslated source','The cue is dominated by English or contains Chinese source script.',{englishWordCount:latin.length,containsChinese:hasChinese(cue.text)}));else if(latin.length&&hasMongolian(cue.text))issues.push(makeIssue('MIXED_LANGUAGE','LANGUAGE','WARNING',[cue],'Mixed-language subtitle','A non-acronym English word remains inside Mongolian text.',{englishWords:latin}));}
    if(source&&negativeSource(source)&&!negativeMongolian(cue.text))issues.push(makeIssue('NEGATION_RISK','TRANSLATION','ERROR',[cue],'Possible negation loss','Source negation has no recognizable Mongolian negation cue.'));
    const sourceNumbers=numberTokens(source),targetNumbers=numberTokens(cue.text);if(sourceNumbers.size&&[...sourceNumbers].some(value=>!targetNumbers.has(value)))issues.push(makeIssue('NUMBER_MISMATCH','TRANSLATION','ERROR',[cue],'Number mismatch','A source number is absent or differs in the edited subtitle.',{sourceNumbers:[...sourceNumbers],targetNumbers:[...targetNumbers]}));
    for(const character of input.characters)if(character.mongolianName&&character.sourceNames.some(name=>includesNormalized(source,name))&&!includesNormalized(cue.text,character.mongolianName))issues.push(makeIssue('NAME_INCONSISTENT','CONSISTENCY','WARNING',[cue],'Character name differs','The edited cue does not use the approved Mongolian character name.',{characterId:character.id,preferred:character.mongolianName}));
    for(const term of input.glossary)if(includesNormalized(source,term.sourceTerm)&&!includesNormalized(cue.text,term.preferredMongolian))issues.push(makeIssue('GLOSSARY_INCONSISTENT','CONSISTENCY','WARNING',[cue],'Glossary preference differs','Review the active contextual glossary preference.',{glossaryId:term.id,preferred:term.preferredMongolian}));
    const previous=cues[index-1];if(previous){const overlap=previous.endMs-cue.startMs;if(overlap>0&&!input.profile.allowOverlaps)issues.push(makeIssue('OVERLAP','TIMING','ERROR',[previous,cue],'Cue overlap','Consecutive cues overlap under this profile.',{overlapMs:overlap}));else if(overlap<=0&&-overlap<input.profile.minimumGapMs)issues.push(makeIssue('MINIMUM_GAP','TIMING','WARNING',[previous,cue],'Very small cue gap','The gap between consecutive cues is below this profile.',{gapMs:-overlap,minimumGapMs:input.profile.minimumGapMs}));if(cue.startMs<previous.startMs)issues.push(makeIssue('TIMING_ORDER','TIMING','WARNING',[previous,cue],'Sequence and timing disagree','Cue sequence order moves backward in time.'));if(normalize(previous.text)&&normalize(previous.text)===normalize(cue.text)&&cue.startMs-previous.endMs<=input.profile.minimumGapMs*4)issues.push(makeIssue('DUPLICATE_CUE','READABILITY','WARNING',[previous,cue],'Possible duplicate cue','Adjacent cues contain the same normalized text.'));}
  }
  for(let start=0;start<cues.length;start++){const end=start+input.profile.denseClusterCueCount-1;if(end>=cues.length)break;const group=cues.slice(start,end+1);if(group.at(-1)!.endMs-group[0]!.startMs<=input.profile.denseClusterWindowMs&&group.every(cue=>cue.endMs-cue.startMs<input.profile.minimumCueDurationMs))issues.push(makeIssue('DENSE_CLUSTER','TIMING','INFO',group,'Dense cue cluster','Several very short cues occur in a compact time window.'));}
  const addressForm=(value:string)=>/(?<!\p{L})чи(?!\p{L})/iu.test(value)?'чи':/(?<!\p{L})та(?!\p{L})/iu.test(value)?'та':null;
  const bySpeaker=new Map<string,QCCue[]>();for(const cue of cues)if(cue.speaker&&addressForm(cue.text)){const list=bySpeaker.get(cue.speaker)??[];list.push(cue);bySpeaker.set(cue.speaker,list);}for(const list of bySpeaker.values())for(let index=1;index<list.length-1;index++){const previous=list[index-1]!,cue=list[index]!,next=list[index+1]!;if(addressForm(previous.text)===addressForm(next.text)&&addressForm(cue.text)!==addressForm(previous.text))issues.push(makeIssue('ADDRESS_SHIFT','CONSISTENCY','WARNING',[cue],'Possible чи/та shift','One address form differs from the surrounding same-speaker pattern.',{before:addressForm(previous.text),current:addressForm(cue.text),after:addressForm(next.text)}));}
  return{issues,passCount:Math.max(0,cues.length-new Set(issues.flatMap(issue=>issue.cueIds)).size),cueCount:cues.length};
}

export function runLocalDocumentQc(input:{documentId:string;mediaDurationMs:number;profile:QCProfileSettings;cues:QCCue[];characters:QCCharacter[];glossary:QCGlossaryTerm[];changedCueIds:string[]}){
  const ordered=[...input.cues].sort((a,b)=>a.sequence-b.sequence||a.startMs-b.startMs||a.id.localeCompare(b.id));const changed=new Set(input.changedCueIds);const indexes=ordered.map((cue,index)=>changed.has(cue.id)?index:-1).filter(index=>index>=0);
  if(!indexes.length)return{issues:[],checkedCueIds:[]};const radius=Math.max(2,input.profile.denseClusterCueCount);const start=Math.max(0,Math.min(...indexes)-radius);const end=Math.min(ordered.length,Math.max(...indexes)+radius+1);const local=ordered.slice(start,end);const result=runDocumentQc({...input,cues:local});
  return{issues:result.issues.filter(issue=>issue.cueIds.some(id=>changed.has(id))),checkedCueIds:local.map(cue=>cue.id)};
}

export function runSeriesConsistencyQc(input:{profile:QCProfileSettings;documents:{documentId:string;episodeId:string;cues:QCCue[]}[];characters:QCCharacter[];glossary:QCGlossaryTerm[]}){
  const issues:QCIssueCandidate[]=[];const cues=input.documents.flatMap(document=>document.cues);
  for(const character of input.characters){const relevant=cues.filter(cue=>character.sourceNames.some(name=>includesNormalized(sourceText(cue),name)));const preferred=relevant.filter(cue=>includesNormalized(cue.text,character.mongolianName));const variants=relevant.filter(cue=>!includesNormalized(cue.text,character.mongolianName)&&likelyNameVariant(cue.text,character.mongolianName));if(preferred.length&&variants.length)issues.push(makeIssue('SERIES_NAME_DRIFT','CONSISTENCY','WARNING',[preferred[0]!,...variants],'Series character-name drift','The same source character uses a near spelling different from the approved Mongolian form.',{characterId:character.id,preferred:character.mongolianName}));}
  for(const term of input.glossary){const conflicting=cues.filter(cue=>includesNormalized(sourceText(cue),term.sourceTerm)&&!includesNormalized(cue.text,term.preferredMongolian));if(conflicting.length>1)issues.push(makeIssue('SERIES_GLOSSARY_DRIFT','CONSISTENCY','WARNING',conflicting,'Series glossary drift','The same source term differs from the approved Mongolian preference across episodes.',{glossaryId:term.id,preferred:term.preferredMongolian}));}
  return issues;
}
