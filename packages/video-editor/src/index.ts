import {z} from 'zod';

export const VIDEO_PROJECT_VERSION='video-project-v1';
export const PREVIEW_DRIFT_SEEK_THRESHOLD_MS=180;
export const PREVIEW_DRIFT_TOLERANCE_MS=45;

export type TrackType='VIDEO'|'AUDIO'|'IMAGE'|'TEXT'|'SUBTITLE'|'EFFECT';
export type FitMode='FIT'|'FILL'|'STRETCH';
export type OverlayType='IMAGE'|'TEXT'|'BLUR';
export interface ProjectTrack{id:string;type:TrackType;order:number;locked:boolean;hidden:boolean;muted:boolean;solo:boolean}
export interface ProjectClip{
  id:string;trackId:string;projectAssetId:string;originClipId:string|null;linkGroupId:string|null;
  timelineStartMs:number;sourceInMs:number;sourceOutMs:number;playbackRate:number;fitMode:FitMode;
  positionX:number;positionY:number;scaleX:number;scaleY:number;rotationDeg:number;opacity:number;
  cropX:number;cropY:number;cropWidth:number;cropHeight:number;brightness:number;contrast:number;saturation:number;
  volume:number;muted:boolean;fadeInMs:number;fadeOutMs:number;
}
export interface ProjectOverlay{
  id:string;trackId:string;projectAssetId:string|null;type:OverlayType;timelineStartMs:number;timelineEndMs:number;
  positionX:number;positionY:number;width:number;height:number;rotationDeg:number;opacity:number;text:string|null;
  fontFamily:string|null;fontSize:number|null;fontWeight:number|null;textColor:string|null;alignment:'LEFT'|'CENTER'|'RIGHT'|null;
  blurStrength:number|null;
}
export interface SourceSubtitle{id:string;startMs:number;endMs:number;text:string}
export interface VideoProjectState{id:string;revision:number;canvasWidth:number;canvasHeight:number;frameRate:number;background:string;activeSubtitleDocumentId:string|null;tracks:ProjectTrack[];clips:ProjectClip[];overlays:ProjectOverlay[];subtitles:SourceSubtitle[]}
export interface MappedSubtitle{sourceCueId:string;sourceClipId:string;startMs:number;endMs:number;text:string;partiallyCut:boolean}
export interface TimelineIndex{project:VideoProjectState;video:ProjectClip[];audio:ProjectClip[];overlays:ProjectOverlay[];subtitles:MappedSubtitle[];videoEndPrefix:number[];audioEndPrefix:number[];overlayEndPrefix:number[];subtitleEndPrefix:number[];durationMs:number}

const id=z.string().uuid();const ms=z.number().int().nonnegative();const unit=z.number().min(0).max(1);
const trackStateSchema=z.object({id,type:z.enum(['VIDEO','AUDIO','IMAGE','TEXT','SUBTITLE','EFFECT']),order:z.number().int().nonnegative(),locked:z.boolean(),hidden:z.boolean(),muted:z.boolean(),solo:z.boolean()}).strict();
const clipStateSchema=z.object({id,trackId:id,projectAssetId:id,originClipId:id.nullable(),linkGroupId:id.nullable(),timelineStartMs:ms,sourceInMs:ms,sourceOutMs:z.number().int().positive(),playbackRate:z.number().min(.25).max(4),fitMode:z.enum(['FIT','FILL','STRETCH']),positionX:unit,positionY:unit,scaleX:z.number().min(.05).max(20),scaleY:z.number().min(.05).max(20),rotationDeg:z.number().min(-360).max(360),opacity:unit,cropX:unit,cropY:unit,cropWidth:z.number().min(.001).max(1),cropHeight:z.number().min(.001).max(1),brightness:z.number().min(0).max(3),contrast:z.number().min(0).max(3),saturation:z.number().min(0).max(3),volume:z.number().min(0).max(2),muted:z.boolean(),fadeInMs:ms,fadeOutMs:ms}).strict().refine(value=>value.sourceOutMs>value.sourceInMs,'Source out must be after source in.');
const overlayStateSchema=z.object({id,trackId:id,projectAssetId:id.nullable(),type:z.enum(['IMAGE','TEXT','BLUR']),timelineStartMs:ms,timelineEndMs:z.number().int().positive(),positionX:unit,positionY:unit,width:z.number().min(.001).max(1),height:z.number().min(.001).max(1),rotationDeg:z.number().min(-360).max(360),opacity:unit,text:z.string().nullable(),fontFamily:z.string().nullable(),fontSize:z.number().nullable(),fontWeight:z.number().int().nullable(),textColor:z.string().nullable(),alignment:z.enum(['LEFT','CENTER','RIGHT']).nullable(),blurStrength:z.number().nullable()}).strict().refine(value=>value.timelineEndMs>value.timelineStartMs,'Overlay end must be after start.');
export const videoProjectStateSchema=z.object({id,revision:z.number().int().nonnegative(),canvasWidth:z.number().int().positive(),canvasHeight:z.number().int().positive(),frameRate:z.number().positive(),background:z.string().regex(/^#[0-9a-fA-F]{6}$/),activeSubtitleDocumentId:id.nullable(),tracks:z.array(trackStateSchema),clips:z.array(clipStateSchema),overlays:z.array(overlayStateSchema),subtitles:z.array(z.object({id,startMs:ms,endMs:z.number().int().positive(),text:z.string()}).strict())}).strict().superRefine((value,context)=>{try{validateProjectState(value);}catch(error){context.addIssue({code:z.ZodIssueCode.custom,message:error instanceof Error?error.message:'Invalid project state.'});}});

export function clipProjectDuration(clip:Pick<ProjectClip,'sourceInMs'|'sourceOutMs'|'playbackRate'>){return Math.round((clip.sourceOutMs-clip.sourceInMs)/clip.playbackRate);}
export function clipProjectEnd(clip:ProjectClip){return clip.timelineStartMs+clipProjectDuration(clip);}
export function projectToSourceTime(clip:ProjectClip,projectTimeMs:number){return Math.round(clip.sourceInMs+(projectTimeMs-clip.timelineStartMs)*clip.playbackRate);}
export function sourceToProjectTime(clip:ProjectClip,sourceTimeMs:number){return Math.round(clip.timelineStartMs+(sourceTimeMs-clip.sourceInMs)/clip.playbackRate);}

function track(project:VideoProjectState,id:string){const value=project.tracks.find(item=>item.id===id);if(!value)throw new Error('Track does not belong to this project.');return value;}
function assertUnit(value:number,label:string){if(!Number.isFinite(value)||value<0||value>1)throw new Error(`${label} must be between 0 and 1.`);}
export function validateProjectState(project:VideoProjectState){
  if(!Number.isInteger(project.canvasWidth)||project.canvasWidth<16||!Number.isInteger(project.canvasHeight)||project.canvasHeight<16)throw new Error('Project canvas is invalid.');
  for(const clip of project.clips){const owner=track(project,clip.trackId);if(!['VIDEO','AUDIO'].includes(owner.type))throw new Error('Media clip must use a video or audio track.');if(!Number.isInteger(clip.timelineStartMs)||clip.timelineStartMs<0||!Number.isInteger(clip.sourceInMs)||clip.sourceInMs<0||!Number.isInteger(clip.sourceOutMs)||clip.sourceOutMs<=clip.sourceInMs)throw new Error('Clip timing is invalid.');if(!Number.isFinite(clip.playbackRate)||clip.playbackRate<0.25||clip.playbackRate>4)throw new Error('Playback rate is invalid.');for(const [value,label] of [[clip.positionX,'Position X'],[clip.positionY,'Position Y'],[clip.opacity,'Opacity'],[clip.cropX,'Crop X'],[clip.cropY,'Crop Y'],[clip.cropWidth,'Crop width'],[clip.cropHeight,'Crop height']] as const)assertUnit(value,label);if(clip.cropX+clip.cropWidth>1||clip.cropY+clip.cropHeight>1)throw new Error('Crop exceeds source bounds.');if(clip.volume<0||clip.volume>2)throw new Error('Volume must be between 0 and 2.');if(clip.fadeInMs<0||clip.fadeOutMs<0||clip.fadeInMs+clip.fadeOutMs>clipProjectDuration(clip))throw new Error('Audio fades exceed clip duration.');}
  for(const owner of project.tracks.filter(item=>item.type==='VIDEO')){const clips=project.clips.filter(clip=>clip.trackId===owner.id).sort((a,b)=>a.timelineStartMs-b.timelineStartMs||a.id.localeCompare(b.id));for(let index=1;index<clips.length;index++)if(clipProjectEnd(clips[index-1]!)>clips[index]!.timelineStartMs)throw new Error('Main video clips may not overlap.');}
  for(const overlay of project.overlays){track(project,overlay.trackId);if(overlay.timelineStartMs<0||overlay.timelineEndMs<=overlay.timelineStartMs)throw new Error('Overlay timing is invalid.');for(const [value,label] of [[overlay.positionX,'Position X'],[overlay.positionY,'Position Y'],[overlay.width,'Width'],[overlay.height,'Height'],[overlay.opacity,'Opacity']] as const)assertUnit(value,label);if(overlay.width===0||overlay.height===0)throw new Error('Overlay size must be positive.');}
  return project;
}

export function mapSubtitlesToProject(project:VideoProjectState):MappedSubtitle[]{
  const videoTrackIds=new Set(project.tracks.filter(item=>item.type==='VIDEO'&&!item.hidden).map(item=>item.id));const result:MappedSubtitle[]=[];const cues=[...project.subtitles].sort((a,b)=>a.startMs-b.startMs||a.endMs-b.endMs||a.id.localeCompare(b.id));const cueEndPrefix:number[]=[];let cueEnd=0;for(const cue of cues){cueEnd=Math.max(cueEnd,cue.endMs);cueEndPrefix.push(cueEnd);}
  for(const clip of project.clips.filter(item=>videoTrackIds.has(item.trackId))){
    let low=0,high=cues.length;while(low<high){const middle=(low+high)>>>1;if(cueEndPrefix[middle]!<=clip.sourceInMs)low=middle+1;else high=middle;}for(let index=low;index<cues.length;index++){const cue=cues[index]!;if(cue.startMs>=clip.sourceOutMs)break;const sourceStart=Math.max(cue.startMs,clip.sourceInMs);const sourceEnd=Math.min(cue.endMs,clip.sourceOutMs);if(sourceEnd<=sourceStart)continue;result.push({sourceCueId:cue.id,sourceClipId:clip.id,startMs:sourceToProjectTime(clip,sourceStart),endMs:sourceToProjectTime(clip,sourceEnd),text:cue.text,partiallyCut:cue.startMs<clip.sourceInMs||cue.endMs>clip.sourceOutMs});}
  }
  return result.sort((a,b)=>a.startMs-b.startMs||a.endMs-b.endMs||a.sourceCueId.localeCompare(b.sourceCueId));
}

export function buildTimelineIndex(project:VideoProjectState):TimelineIndex{
  validateProjectState(project);const typeByTrack=new Map(project.tracks.map(item=>[item.id,item]));const visible=(clip:ProjectClip)=>!typeByTrack.get(clip.trackId)?.hidden;
  const sort=(a:ProjectClip,b:ProjectClip)=>a.timelineStartMs-b.timelineStartMs||a.id.localeCompare(b.id);const video=project.clips.filter(clip=>typeByTrack.get(clip.trackId)?.type==='VIDEO'&&visible(clip)).sort(sort);const audio=project.clips.filter(clip=>typeByTrack.get(clip.trackId)?.type==='AUDIO'&&visible(clip)).sort(sort);const overlays=project.overlays.filter(item=>!typeByTrack.get(item.trackId)?.hidden).sort((a,b)=>a.timelineStartMs-b.timelineStartMs||a.id.localeCompare(b.id));const subtitles=mapSubtitlesToProject(project);const prefix=<T>(items:readonly T[],end:(item:T)=>number)=>{const result:number[]=[];let maximum=0;for(const item of items){maximum=Math.max(maximum,end(item));result.push(maximum);}return result;};const durationMs=Math.max(0,...video.map(clipProjectEnd),...audio.map(clipProjectEnd),...overlays.map(item=>item.timelineEndMs),...subtitles.map(item=>item.endMs));return{project,video,audio,overlays,subtitles,videoEndPrefix:prefix(video,clipProjectEnd),audioEndPrefix:prefix(audio,clipProjectEnd),overlayEndPrefix:prefix(overlays,item=>item.timelineEndMs),subtitleEndPrefix:prefix(subtitles,item=>item.endMs),durationMs};
}
function activeIntervals<T>(items:readonly T[],endPrefix:readonly number[],timeMs:number,start:(item:T)=>number,end:(item:T)=>number){let low=0,high=items.length;while(low<high){const middle=(low+high)>>>1;if(start(items[middle]!)<=timeMs)low=middle+1;else high=middle;}const result:T[]=[];for(let index=low-1;index>=0;index--){if(endPrefix[index]!<=timeMs)break;const item=items[index]!;if(end(item)>timeMs)result.push(item);}return result.reverse();}
export function resolveTimeline(index:TimelineIndex,projectTimeMs:number){
  const video=activeIntervals(index.video,index.videoEndPrefix,projectTimeMs,item=>item.timelineStartMs,clipProjectEnd).at(-1)??null;const audio=activeIntervals(index.audio,index.audioEndPrefix,projectTimeMs,item=>item.timelineStartMs,clipProjectEnd).filter(item=>!index.project.tracks.find(track=>track.id===item.trackId)?.muted).map(clip=>({clip,sourceTimeMs:projectToSourceTime(clip,projectTimeMs),gain:audioGainAt(clip,projectTimeMs)}));const overlays=activeIntervals(index.overlays,index.overlayEndPrefix,projectTimeMs,item=>item.timelineStartMs,item=>item.timelineEndMs);const subtitles=activeIntervals(index.subtitles,index.subtitleEndPrefix,projectTimeMs,item=>item.startMs,item=>item.endMs);return{video:video?{clip:video,sourceTimeMs:projectToSourceTime(video,projectTimeMs)}:null,audio,overlays,subtitles};
}
export function audioGainAt(clip:ProjectClip,projectTimeMs:number){if(clip.muted||projectTimeMs<clip.timelineStartMs||projectTimeMs>=clipProjectEnd(clip))return 0;const elapsed=projectTimeMs-clip.timelineStartMs;const remaining=clipProjectEnd(clip)-projectTimeMs;const fadeIn=clip.fadeInMs?Math.min(1,elapsed/clip.fadeInMs):1;const fadeOut=clip.fadeOutMs?Math.min(1,remaining/clip.fadeOutMs):1;return clip.volume*Math.min(fadeIn,fadeOut);}

export type VideoOperation=
  |{type:'SPLIT_CLIP';clipId:string;projectTimeMs:number}
  |{type:'TRIM_CLIP_START'|'TRIM_CLIP_END';clipId:string;projectTimeMs:number}
  |{type:'MOVE_CLIP';clipId:string;timelineStartMs:number}
  |{type:'DELETE_CLIP';clipId:string}
  |{type:'SET_LINKED';clipId:string;linked:boolean;linkGroupId?:string}
  |{type:'UPDATE_CLIP';clipId:string;changes:Partial<Omit<ProjectClip,'id'|'trackId'|'projectAssetId'|'originClipId'|'sourceInMs'|'sourceOutMs'|'timelineStartMs'>>}
  |{type:'CREATE_CLIP';clip:ProjectClip}
  |{type:'CREATE_OVERLAY';overlay:ProjectOverlay}
  |{type:'UPDATE_OVERLAY';overlayId:string;changes:Partial<Omit<ProjectOverlay,'id'|'trackId'|'type'|'projectAssetId'>>}
  |{type:'DELETE_OVERLAY';overlayId:string}
  |{type:'UPDATE_TRACK';trackId:string;changes:Partial<Pick<ProjectTrack,'locked'|'hidden'|'muted'|'solo'|'order'>>}
  |{type:'UPDATE_PROJECT';changes:Partial<Pick<VideoProjectState,'canvasWidth'|'canvasHeight'|'frameRate'|'background'|'activeSubtitleDocumentId'>>};

function targets(project:VideoProjectState,clip:ProjectClip){return clip.linkGroupId?project.clips.filter(item=>item.linkGroupId===clip.linkGroupId):[clip];}
function clone(project:VideoProjectState):VideoProjectState{return structuredClone(project);}
export function applyVideoOperation(project:VideoProjectState,operation:VideoOperation,createId:()=>string=()=>crypto.randomUUID()):VideoProjectState{
  const next=clone(project);const clip='clipId' in operation?next.clips.find(item=>item.id===operation.clipId):undefined;if('clipId' in operation&&!clip)throw new Error('Clip not found.');if(clip&&track(next,clip.trackId).locked)throw new Error('Track is locked.');
  if(operation.type==='SPLIT_CLIP'){
    for(const item of targets(next,clip!)){if(operation.projectTimeMs<=item.timelineStartMs||operation.projectTimeMs>=clipProjectEnd(item))throw new Error('Split point must be inside every linked clip.');const sourceSplit=projectToSourceTime(item,operation.projectTimeMs);const right={...item,id:createId(),originClipId:item.originClipId??item.id,timelineStartMs:operation.projectTimeMs,sourceInMs:sourceSplit};item.sourceOutMs=sourceSplit;next.clips.push(right);}
  }else if(operation.type==='TRIM_CLIP_START'){
    for(const item of targets(next,clip!)){if(operation.projectTimeMs<item.timelineStartMs||operation.projectTimeMs>=clipProjectEnd(item))throw new Error('Trim start must remain inside the clip.');item.sourceInMs=projectToSourceTime(item,operation.projectTimeMs);item.timelineStartMs=operation.projectTimeMs;}
  }else if(operation.type==='TRIM_CLIP_END'){
    for(const item of targets(next,clip!)){if(operation.projectTimeMs<=item.timelineStartMs||operation.projectTimeMs>clipProjectEnd(item))throw new Error('Trim end must remain inside the clip.');item.sourceOutMs=projectToSourceTime(item,operation.projectTimeMs);}
  }else if(operation.type==='MOVE_CLIP'){
    const delta=operation.timelineStartMs-clip!.timelineStartMs;if(operation.timelineStartMs<0)throw new Error('Clip cannot move before project start.');for(const item of targets(next,clip!))item.timelineStartMs+=delta;
  }else if(operation.type==='DELETE_CLIP'){const ids=new Set(targets(next,clip!).map(item=>item.id));next.clips=next.clips.filter(item=>!ids.has(item.id));
  }else if(operation.type==='SET_LINKED'){if(operation.linked)clip!.linkGroupId=operation.linkGroupId??createId();else clip!.linkGroupId=null;
  }else if(operation.type==='UPDATE_CLIP'){Object.assign(clip!,operation.changes);
  }else if(operation.type==='CREATE_CLIP'){next.clips.push(operation.clip);
  }else if(operation.type==='CREATE_OVERLAY'){if(track(next,operation.overlay.trackId).locked)throw new Error('Track is locked.');next.overlays.push(operation.overlay);
  }else if(operation.type==='UPDATE_OVERLAY'){const overlay=next.overlays.find(item=>item.id===operation.overlayId);if(!overlay)throw new Error('Overlay not found.');if(track(next,overlay.trackId).locked)throw new Error('Track is locked.');Object.assign(overlay,operation.changes);
  }else if(operation.type==='DELETE_OVERLAY'){const overlay=next.overlays.find(item=>item.id===operation.overlayId);if(!overlay)throw new Error('Overlay not found.');if(track(next,overlay.trackId).locked)throw new Error('Track is locked.');next.overlays=next.overlays.filter(item=>item.id!==overlay.id);
  }else if(operation.type==='UPDATE_TRACK'){const owner=track(next,operation.trackId);Object.assign(owner,operation.changes);
  }else if(operation.type==='UPDATE_PROJECT')Object.assign(next,operation.changes);
  return validateProjectState(next);
}

export function snapProjectTime(candidate:number,points:readonly number[],thresholdMs=120,enabled=true){if(!enabled)return Math.max(0,Math.round(candidate));let best=Math.max(0,Math.round(candidate)),distance=thresholdMs+1;for(const point of points){const current=Math.abs(candidate-point);if(current<distance||(current===distance&&point<best)){best=point;distance=current;}}return distance<=thresholdMs?best:Math.max(0,Math.round(candidate));}
