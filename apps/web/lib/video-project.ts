export class ProjectClock{
  private projectTimeMs=0;private anchorPerformanceMs=0;private rate=1;private running=false;
  play(performanceMs:number,rate=1){this.projectTimeMs=this.at(performanceMs);this.anchorPerformanceMs=performanceMs;this.rate=rate;this.running=true;}
  pause(performanceMs:number){this.projectTimeMs=this.at(performanceMs);this.running=false;}
  seek(timeMs:number,performanceMs=0){this.projectTimeMs=Math.max(0,timeMs);this.anchorPerformanceMs=performanceMs;}
  at(performanceMs:number){return Math.max(0,this.projectTimeMs+(this.running?(performanceMs-this.anchorPerformanceMs)*this.rate:0));}
  get isPlaying(){return this.running;}
}

export function clipProjectEnd(clip:{timelineStartMs:number;sourceInMs:number;sourceOutMs:number;playbackRate:number}){return clip.timelineStartMs+Math.round((clip.sourceOutMs-clip.sourceInMs)/clip.playbackRate);}
export function projectToSource(clip:{timelineStartMs:number;sourceInMs:number;playbackRate:number},projectTimeMs:number){return clip.sourceInMs+(projectTimeMs-clip.timelineStartMs)*clip.playbackRate;}
export function formatProjectTime(ms:number){const safe=Math.max(0,Math.round(ms));const hours=Math.floor(safe/3_600_000);const minutes=Math.floor(safe%3_600_000/60_000);const seconds=Math.floor(safe%60_000/1000);return`${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}.${String(safe%1000).padStart(3,'0')}`;}
export function visibleTimelineWindow<T extends {startMs:number;endMs:number}>(items:readonly T[],startMs:number,endMs:number,paddingMs=2000){return items.filter(item=>item.endMs>=startMs-paddingMs&&item.startMs<=endMs+paddingMs);}
export function canHandleVideoShortcut(target:{tagName:string;isContentEditable:boolean;isComposing:boolean}){return!target.isComposing&&!target.isContentEditable&&!['INPUT','TEXTAREA','SELECT'].includes(target.tagName);}
