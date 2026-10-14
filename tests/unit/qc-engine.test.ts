import {describe,expect,it} from 'vitest';
import {
  DEFAULT_QC_PROFILE,
  issueFingerprint,
  runDocumentQc,
  runLocalDocumentQc,
  runSeriesConsistencyQc,
  type QCCue,
} from '../../packages/qc/src/index';

const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const cue=(n:number,text:string,startMs:number,endMs:number,extra:Partial<QCCue>={}):QCCue=>({
  id:id(n),documentId:id(100),episodeId:id(200),sequence:n,startMs,endMs,text,origin:'MANUAL',
  speaker:'SPEAKER_00',sourceTexts:[],sourceLanguage:'en',sourceReviewClassification:'HIGH_CONFIDENCE',
  ...extra,
});

describe('Phase 06 deterministic document QC',()=>{
  it('finds invalid timing, overlap, small gaps, ordering and dense clusters',()=>{
    const result=runDocumentQc({documentId:id(100),mediaDurationMs:10_000,profile:DEFAULT_QC_PROFILE,cues:[
      cue(0,'Нэг',0,250),
      cue(1,'Хоёр',200,450),
      cue(2,'Гурав',460,700),
      cue(3,'Дөрөв',10_100,10_500),
      cue(4,'Тав',9_000,9_500),
    ],characters:[],glossary:[]});
    const types=result.issues.map(issue=>issue.type);
    expect(types).toEqual(expect.arrayContaining(['VERY_SHORT','OVERLAP','MINIMUM_GAP','TIMING_ORDER','OUTSIDE_MEDIA','DENSE_CLUSTER']));
    expect(result.issues.find(issue=>issue.type==='OVERLAP')?.cueIds).toEqual([id(0),id(1)]);
  });

  it('explains readability and safe text cleanup without mutating text',()=>{
    const original='  Энэ бол маш урт бөгөөд хурдан унших шаардлагатай мөр.  \n!';
    const result=runDocumentQc({documentId:id(100),mediaDurationMs:10_000,profile:{...DEFAULT_QC_PROFILE,maximumCharactersPerLine:20},cues:[cue(1,original,0,700),cue(2,original,800,1_500)],characters:[],glossary:[]});
    const types=result.issues.map(issue=>issue.type);
    expect(types).toEqual(expect.arrayContaining(['READING_SPEED','LINE_LENGTH','AWKWARD_LINE_BREAK','WHITESPACE','DUPLICATE_CUE']));
    expect(result.issues.find(issue=>issue.type==='WHITESPACE')?.suggestions[0]).toMatchObject({type:'UPDATE_TEXT',text:'Энэ бол маш урт бөгөөд хурдан унших шаардлагатай мөр.\n!'});
    expect(result.issues.every(issue=>issue.severity!=='ERROR'||issue.type!=='READING_SPEED')).toBe(true);
    expect(result.issues.length).toBeLessThan(20);
  });

  it('detects untranslated text, mixed language, negation, number, name and glossary risks',()=>{
    const result=runDocumentQc({documentId:id(100),mediaDurationMs:20_000,profile:DEFAULT_QC_PROFILE,cues:[
      cue(1,"I won't give Li Wei three days.",0,2_000,{sourceTexts:["I won't give Li Wei three days."]}),
      cue(2,'Би tomorrow Ли Вейд хоёр хоног өгнө.',2_100,4_500,{sourceTexts:["I won't give Li Wei three days."]}),
      cue(3,'王爷 ирлээ.',5_000,7_000,{sourceTexts:['王爷回来了。'],sourceLanguage:'zh'}),
    ],characters:[{id:id(301),sourceNames:['Li Wei'],mongolianName:'Ли Вэй'}],glossary:[{id:id(401),sourceTerm:'王爷',preferredMongolian:'Ван ноён'}]});
    const types=result.issues.map(issue=>issue.type);
    expect(types).toEqual(expect.arrayContaining(['UNTRANSLATED_SOURCE','MIXED_LANGUAGE','NEGATION_RISK','NUMBER_MISMATCH','NAME_INCONSISTENT','GLOSSARY_INCONSISTENT']));
    expect(result.issues.find(issue=>issue.type==='NEGATION_RISK')?.severity).toBe('ERROR');
  });

  it('flags isolated чи/та switching only as review guidance',()=>{
    const cues=['Та ирэв үү?','Та сууна уу.','Чи сонсож байна уу?','Та ойлгов уу?'].map((text,index)=>cue(index+1,text,index*2_000,index*2_000+1_500));
    const result=runDocumentQc({documentId:id(100),mediaDurationMs:10_000,profile:DEFAULT_QC_PROFILE,cues,characters:[],glossary:[]});
    const issue=result.issues.find(item=>item.type==='ADDRESS_SHIFT');
    expect(issue).toMatchObject({severity:'WARNING',cueIds:[id(3)]});
  });

  it('changes a fingerprint only when relevant evidence changes',()=>{
    const base={type:'WHITESPACE' as const,cueIds:[id(1)],evidence:{text:'  Сайн уу'}};
    expect(issueFingerprint(base)).toBe(issueFingerprint(base));
    expect(issueFingerprint(base)).not.toBe(issueFingerprint({...base,evidence:{text:'Сайн уу  '}}));
  });

  it('rechecks a changed cue with bounded timing neighbors',()=>{const cues=Array.from({length:20},(_,index)=>cue(index+1,`Мөр ${index+1}`,index*1_100,index*1_100+1_000));cues[10]={...cues[10]!,startMs:cues[9]!.endMs-50,text:'  Засах мөр  '};const result=runLocalDocumentQc({documentId:id(100),mediaDurationMs:30_000,profile:DEFAULT_QC_PROFILE,cues,characters:[],glossary:[],changedCueIds:[cues[10]!.id]});expect(result.issues.map(issue=>issue.type)).toEqual(expect.arrayContaining(['OVERLAP','WHITESPACE']));expect(result.checkedCueIds.length).toBeLessThan(cues.length);expect(result.issues.every(issue=>issue.cueIds.includes(cues[10]!.id))).toBe(true);});
});

describe('Phase 06 series consistency',()=>{
  it('groups cross-episode name drift and points to exact cues without all-pairs output',()=>{
    const issues=runSeriesConsistencyQc({
      profile:DEFAULT_QC_PROFILE,
      characters:[{id:id(301),sourceNames:['Li Wei'],mongolianName:'Ли Вэй'}],
      glossary:[],
      documents:[
        {documentId:id(100),episodeId:id(200),cues:[cue(1,'Ли Вэй ирлээ.',0,1_500,{id:id(501),documentId:id(100),episodeId:id(200),sourceTexts:['Li Wei arrived.']})]},
        {documentId:id(101),episodeId:id(201),cues:[cue(1,'Ли Вей явлаа.',0,1_500,{id:id(502),documentId:id(101),episodeId:id(201),sourceTexts:['Li Wei left.']})]},
      ],
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({type:'SERIES_NAME_DRIFT',severity:'WARNING',cueIds:[id(501),id(502)]});
  });
});
