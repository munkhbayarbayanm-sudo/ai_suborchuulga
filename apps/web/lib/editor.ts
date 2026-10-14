export interface ShortcutContext {tagName:string;isContentEditable:boolean;isComposing:boolean}

export function canHandleEditorShortcut(context:ShortcutContext){
  const tag=context.tagName.toUpperCase();
  return !context.isComposing&&!context.isContentEditable&&tag!=='INPUT'&&tag!=='TEXTAREA'&&tag!=='SELECT';
}

export function visibleCueSlice(total:number,scrollTop:number,rowHeight:number,overscan=6){
  const viewportRows=Math.ceil(480/rowHeight);
  const start=Math.max(0,Math.floor(scrollTop/rowHeight)-overscan);
  const end=Math.min(total,start+viewportRows+overscan*2);
  return{start,end,offsetPx:start*rowHeight};
}

export function discardDebouncedDrafts<T>(timers:Map<string,ReturnType<typeof setTimeout>>,drafts:Map<string,T>){
  for(const timer of timers.values())clearTimeout(timer);timers.clear();drafts.clear();
}

type FrameMetadata={mediaTime:number};
export interface FrameVideo {currentTime:number;requestVideoFrameCallback?:(callback:(now:number,metadata:FrameMetadata)=>void)=>number;cancelVideoFrameCallback?:(id:number)=>void}

export function startVideoFrameSync(video:FrameVideo,onFrame:(timeMs:number)=>void){
  let stopped=false;let frameId:number|undefined;let timer:ReturnType<typeof setTimeout>|undefined;
  if(video.requestVideoFrameCallback){
    const tick=(_now:number,metadata:FrameMetadata)=>{if(stopped)return;onFrame(Math.round(metadata.mediaTime*1000));frameId=video.requestVideoFrameCallback!(tick);};
    frameId=video.requestVideoFrameCallback(tick);
  }else{
    const tick=()=>{if(stopped)return;onFrame(Math.round(video.currentTime*1000));timer=setTimeout(tick,33);};tick();
  }
  return()=>{stopped=true;if(frameId!==undefined)video.cancelVideoFrameCallback?.(frameId);if(timer)clearTimeout(timer);};
}

export function formatTimecode(ms:number){
  const safe=Math.max(0,Math.round(ms));const hours=Math.floor(safe/3_600_000);const minutes=Math.floor(safe%3_600_000/60_000);const seconds=Math.floor(safe%60_000/1000);const millis=safe%1000;
  return`${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}.${String(millis).padStart(3,'0')}`;
}
