import {describe,expect,it} from 'vitest';
import {
  applyVideoOperation,
  audioGainAt,
  buildTimelineIndex,
  clipProjectDuration,
  mapSubtitlesToProject,
  projectToSourceTime,
  resolveTimeline,
  type VideoProjectState,
} from '../../packages/video-editor/src/index';

const ids={project:'10000000-0000-4000-8000-000000000001',videoTrack:'10000000-0000-4000-8000-000000000002',audioTrack:'10000000-0000-4000-8000-000000000003',subtitleTrack:'10000000-0000-4000-8000-000000000004',asset:'10000000-0000-4000-8000-000000000005',video:'10000000-0000-4000-8000-000000000006',audio:'10000000-0000-4000-8000-000000000007',link:'10000000-0000-4000-8000-000000000008'};
const state=():VideoProjectState=>({id:ids.project,revision:0,canvasWidth:1920,canvasHeight:1080,frameRate:30,background:'#000000',activeSubtitleDocumentId:'10000000-0000-4000-8000-000000000009',tracks:[{id:ids.videoTrack,type:'VIDEO',order:2,locked:false,hidden:false,muted:false,solo:false},{id:ids.audioTrack,type:'AUDIO',order:1,locked:false,hidden:false,muted:false,solo:false},{id:ids.subtitleTrack,type:'SUBTITLE',order:3,locked:false,hidden:false,muted:false,solo:false}],clips:[{id:ids.video,trackId:ids.videoTrack,projectAssetId:ids.asset,originClipId:null,linkGroupId:ids.link,timelineStartMs:30_000,sourceInMs:10_000,sourceOutMs:20_000,playbackRate:1,fitMode:'FIT',positionX:0.5,positionY:0.5,scaleX:1,scaleY:1,rotationDeg:0,opacity:1,cropX:0,cropY:0,cropWidth:1,cropHeight:1,brightness:1,contrast:1,saturation:1,volume:1,muted:false,fadeInMs:0,fadeOutMs:0},{id:ids.audio,trackId:ids.audioTrack,projectAssetId:ids.asset,originClipId:null,linkGroupId:ids.link,timelineStartMs:30_000,sourceInMs:10_000,sourceOutMs:20_000,playbackRate:1,fitMode:'FIT',positionX:0.5,positionY:0.5,scaleX:1,scaleY:1,rotationDeg:0,opacity:1,cropX:0,cropY:0,cropWidth:1,cropHeight:1,brightness:1,contrast:1,saturation:1,volume:0.8,muted:false,fadeInMs:1000,fadeOutMs:1000}],overlays:[],subtitles:[{id:'10000000-0000-4000-8000-000000000010',startMs:12_000,endMs:14_000,text:'Энд байна.'},{id:'10000000-0000-4000-8000-000000000011',startMs:19_000,endMs:21_000,text:'Хэсэгчлэн тайрагдана.'}]});

describe('project time mapping and resolver',()=>{
  it('maps project time to source time and respects playback rate',()=>{const clip=state().clips[0]!;expect(projectToSourceTime(clip,34_000)).toBe(14_000);expect(clipProjectDuration({...clip,playbackRate:2})).toBe(5_000);expect(projectToSourceTime({...clip,playbackRate:2},34_000)).toBe(18_000);});
  it('returns a black gap and bounded active media from an ordered index',()=>{const project=state();const index=buildTimelineIndex(project);expect(resolveTimeline(index,29_999).video).toBeNull();const active=resolveTimeline(index,33_000);expect(active.video?.sourceTimeMs).toBe(13_000);expect(active.audio).toHaveLength(1);expect(active.subtitles.map(item=>item.text)).toEqual(['Энд байна.']);});
  it('projects retained subtitle source intervals without mutating cues',()=>{const mapped=mapSubtitlesToProject(state());expect(mapped).toEqual(expect.arrayContaining([expect.objectContaining({sourceCueId:'10000000-0000-4000-8000-000000000010',startMs:32_000,endMs:34_000,partiallyCut:false}),expect.objectContaining({sourceCueId:'10000000-0000-4000-8000-000000000011',startMs:39_000,endMs:40_000,partiallyCut:true})]));});
});

describe('non-destructive project operations',()=>{
  it('splits linked video and audio at exact source/project positions',()=>{let next=20;const result=applyVideoOperation(state(),{type:'SPLIT_CLIP',clipId:ids.video,projectTimeMs:34_000},()=>`10000000-0000-4000-8000-${String(next++).padStart(12,'0')}`);expect(result.clips).toHaveLength(4);expect(result.clips.filter(clip=>clip.trackId===ids.videoTrack).map(clip=>[clip.timelineStartMs,clip.sourceInMs,clip.sourceOutMs])).toEqual([[30_000,10_000,14_000],[34_000,14_000,20_000]]);expect(result.clips.filter(clip=>clip.trackId===ids.audioTrack)).toHaveLength(2);});
  it('trims and moves a linked group while rejecting main-video collisions',()=>{const trimmed=applyVideoOperation(state(),{type:'TRIM_CLIP_START',clipId:ids.video,projectTimeMs:32_000});expect(trimmed.clips.find(clip=>clip.id===ids.video)).toMatchObject({timelineStartMs:32_000,sourceInMs:12_000});const moved=applyVideoOperation(trimmed,{type:'MOVE_CLIP',clipId:ids.video,timelineStartMs:0});expect(moved.clips.filter(clip=>clip.linkGroupId===ids.link).every(clip=>clip.timelineStartMs===0)).toBe(true);const collision={...state(),clips:[...state().clips,{...state().clips[0]!,id:'10000000-0000-4000-8000-000000000099',linkGroupId:null,timelineStartMs:0,sourceInMs:0,sourceOutMs:5000}]};expect(()=>applyVideoOperation(collision,{type:'MOVE_CLIP',clipId:ids.video,timelineStartMs:2000})).toThrow(/overlap/i);});
  it('deletes linked clips into a gap and computes fades without changing assets',()=>{const deleted=applyVideoOperation(state(),{type:'DELETE_CLIP',clipId:ids.video});expect(deleted.clips).toEqual([]);expect(audioGainAt(state().clips[1]!,30_500)).toBeCloseTo(0.4);expect(audioGainAt(state().clips[1]!,35_000)).toBeCloseTo(0.8);expect(audioGainAt({...state().clips[1]!,muted:true},35_000)).toBe(0);});
});
