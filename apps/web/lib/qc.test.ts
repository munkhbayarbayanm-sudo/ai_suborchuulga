import {describe,expect,it} from 'vitest';
import {filterQcIssues,nextQcIssue,qcMarkers,type QCIssueFilter} from './qc';
import type {QCIssueDto} from '@mongolsub/contracts';

const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const issue=(n:number,severity:'INFO'|'WARNING'|'ERROR',category:'TIMING'|'READABILITY'|'LANGUAGE'|'TRANSLATION'|'CONSISTENCY',state:'OPEN'|'RESOLVED'|'IGNORED'):QCIssueDto=>({id:id(n),qcRunId:id(99),fingerprint:String(n).padStart(64,'0'),type:category==='TIMING'?'OVERLAP':'READING_SPEED',category,severity,state,title:'Issue',explanation:'Explain',metrics:{},confidence:null,ignoredReason:null,resolvedAt:null,createdAt:new Date(0).toISOString(),updatedAt:new Date(0).toISOString(),cues:[{subtitleCueId:id(n+10),subtitleDocumentId:id(50),episodeId:id(60),sequence:n,startMs:n*1000,endMs:n*1000+500,text:'Cue',isPrimary:true}],suggestions:[]});

describe('Phase 06 QC review helpers',()=>{
  const issues=[issue(1,'ERROR','TIMING','OPEN'),issue(2,'WARNING','TRANSLATION','OPEN'),issue(3,'INFO','READABILITY','RESOLVED')];
  it('combines filter-first review dimensions',()=>{const filter:QCIssueFilter={severity:'ERROR',category:'ALL',state:'OPEN'};expect(filterQcIssues(issues,filter).map(item=>item.id)).toEqual([id(1)]);expect(filterQcIssues(issues,{severity:'ALL',category:'TRANSLATION',state:'OPEN'}).map(item=>item.id)).toEqual([id(2)]);});
  it('wraps next and previous issue navigation',()=>{expect(nextQcIssue(issues,id(1),1)?.id).toBe(id(2));expect(nextQcIssue(issues,id(1),-1)?.id).toBe(id(3));});
  it('uses one accessible highest-severity marker per cue',()=>{const markers=qcMarkers([...issues,issue(4,'WARNING','TIMING','OPEN')]);expect(markers.get(id(11))).toMatchObject({severity:'ERROR',label:'Error'});expect(markers.get(id(13))).toMatchObject({severity:'INFO',label:'Resolved'});});
});
