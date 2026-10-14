import type {QCIssueDto} from '@mongolsub/contracts';

export type QCIssueFilter={
  severity:'ALL'|QCIssueDto['severity'];
  category:'ALL'|QCIssueDto['category'];
  state:'ALL'|QCIssueDto['state'];
};

export function filterQcIssues(issues:readonly QCIssueDto[],filter:QCIssueFilter){
  return issues.filter(issue=>(filter.severity==='ALL'||issue.severity===filter.severity)&&(filter.category==='ALL'||issue.category===filter.category)&&(filter.state==='ALL'||issue.state===filter.state));
}

export function nextQcIssue(issues:readonly QCIssueDto[],currentId:string|null,direction:1|-1){
  if(!issues.length)return null;
  const current=issues.findIndex(issue=>issue.id===currentId);
  const index=current<0?(direction===1?0:issues.length-1):(current+direction+issues.length)%issues.length;
  return issues[index]??null;
}

export type QCMarker={severity:QCIssueDto['severity'];label:string;issueId:string};
const rank:Record<QCIssueDto['severity'],number>={INFO:1,WARNING:2,ERROR:3};
export function qcMarkers(issues:readonly QCIssueDto[]){
  const markers=new Map<string,QCMarker>();
  for(const issue of issues){
    for(const cue of issue.cues){
      const current=markers.get(cue.subtitleCueId);
      if(current&&rank[current.severity]>rank[issue.severity])continue;
      const label=issue.state==='RESOLVED'?'Resolved':issue.state==='IGNORED'?'Ignored':issue.severity==='ERROR'?'Error':issue.severity==='WARNING'?'Warning':'Info';
      markers.set(cue.subtitleCueId,{severity:issue.severity,label,issueId:issue.id});
    }
  }
  return markers;
}
