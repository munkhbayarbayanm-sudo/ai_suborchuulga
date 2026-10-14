import {describe,expect,it} from 'vitest';
import {
  applyTimingEdit,
  cueWarnings,
  createPeakAggregator,
  editorOperationRequestSchema,
  parseByteRange,
  resolveHistoryTargets,
  snapTime,
  splitCueText,
  type EditorCue,
} from '../../packages/editor/src/index';

const cue=(overrides:Partial<EditorCue>={}):EditorCue=>({id:'10000000-0000-4000-8000-000000000001',sequence:0,startMs:1000,endMs:3000,text:'Би чамайг хүлээж байсан.',revision:0,...overrides});

describe('editor timing',()=>{
  it('moves a cue without changing duration and clamps to the media timeline',()=>{
    expect(applyTimingEdit(cue(),'MOVE',{deltaMs:500},10_000)).toEqual({startMs:1500,endMs:3500});
    expect(applyTimingEdit(cue(),'MOVE',{deltaMs:-5000},10_000)).toEqual({startMs:0,endMs:2000});
  });
  it('resizes one edge while enforcing positive media-bounded timing',()=>{
    expect(applyTimingEdit(cue(),'RESIZE_START',{timeMs:1800},10_000)).toEqual({startMs:1800,endMs:3000});
    expect(()=>applyTimingEdit(cue(),'RESIZE_END',{timeMs:1000},10_000)).toThrow(/end/i);
    expect(()=>applyTimingEdit(cue(),'RESIZE_END',{timeMs:10_001},10_000)).toThrow(/duration/i);
  });
  it('snaps only inside the optional threshold and reports immediate warnings',()=>{
    expect(snapTime(1992,[1000,2000,3000],{enabled:true,thresholdMs:12})).toBe(2000);
    expect(snapTime(1980,[2000],{enabled:true,thresholdMs:12})).toBe(1980);
    expect(snapTime(1999,[2000],{enabled:false,thresholdMs:12})).toBe(1999);
    expect(cueWarnings(cue({startMs:1000,endMs:1080,text:''}),[cue({id:'10000000-0000-4000-8000-000000000002',startMs:1050,endMs:1500})],10_000)).toEqual(['EMPTY_CUE','EXTREMELY_SHORT','OVERLAP']);
  });
});

describe('structural editing helpers',()=>{
  it('splits at a caret without splitting a Unicode code point',()=>{
    expect(splitCueText('Сайн уу 👋 найз аа',0.5,8)).toEqual({left:'Сайн уу',right:'👋 найз аа'});
    expect(splitCueText('A😀B',0.5,2)).toEqual({left:'A',right:'😀B'});
  });
  it('uses a deterministic nearest word boundary when no caret exists',()=>{
    expect(splitCueText('Би чамайг хүлээж байсан.',0.52)).toEqual({left:'Би чамайг',right:'хүлээж байсан.'});
  });
  it('runtime-validates operation-specific payloads',()=>{
    const parsed=editorOperationRequestSchema.parse({type:'MOVE_CUE',baseRevision:4,payload:{cueId:cue().id,startMs:1500,endMs:3500}});
    expect(parsed.type).toBe('MOVE_CUE');
    expect(()=>editorOperationRequestSchema.parse({type:'MOVE_CUE',baseRevision:4,payload:{cueId:cue().id,startMs:-1,endMs:3}})).toThrow();
    expect(()=>editorOperationRequestSchema.parse({type:'UPDATE_TEXT',baseRevision:4,payload:{cueId:cue().id,text:''}})).not.toThrow();
  });
  it('derives auditable linear undo/redo targets without deleting history',()=>{
    const a='10000000-0000-4000-8000-000000000011';const b='10000000-0000-4000-8000-000000000012';
    const undo='10000000-0000-4000-8000-000000000013';const redo='10000000-0000-4000-8000-000000000014';
    expect(resolveHistoryTargets([{id:a,type:'UPDATE_TEXT',targetOperationId:null},{id:b,type:'MOVE_CUE',targetOperationId:null}])).toEqual({undoOperationId:b,redoOperationId:null});
    expect(resolveHistoryTargets([{id:a,type:'UPDATE_TEXT',targetOperationId:null},{id:b,type:'MOVE_CUE',targetOperationId:null},{id:undo,type:'UNDO',targetOperationId:b}])).toEqual({undoOperationId:a,redoOperationId:b});
    expect(resolveHistoryTargets([{id:a,type:'UPDATE_TEXT',targetOperationId:null},{id:b,type:'MOVE_CUE',targetOperationId:null},{id:undo,type:'UNDO',targetOperationId:b},{id:redo,type:'REDO',targetOperationId:b}])).toEqual({undoOperationId:b,redoOperationId:null});
    expect(resolveHistoryTargets([{id:a,type:'UPDATE_TEXT',targetOperationId:null},{id:b,type:'MOVE_CUE',targetOperationId:null},{id:undo,type:'UNDO',targetOperationId:b},{id:redo,type:'UPDATE_TEXT',targetOperationId:null}])).toEqual({undoOperationId:redo,redoOperationId:null});
  });
});

describe('controlled media delivery',()=>{
  it('parses full, bounded, suffix and invalid byte ranges deterministically',()=>{
    expect(parseByteRange(undefined,1000)).toEqual({kind:'FULL',start:0,end:999,length:1000});
    expect(parseByteRange('bytes=100-199',1000)).toEqual({kind:'PARTIAL',start:100,end:199,length:100});
    expect(parseByteRange('bytes=900-',1000)).toEqual({kind:'PARTIAL',start:900,end:999,length:100});
    expect(parseByteRange('bytes=-50',1000)).toEqual({kind:'PARTIAL',start:950,end:999,length:50});
    expect(parseByteRange('bytes=1000-1200',1000)).toEqual({kind:'UNSATISFIABLE',size:1000});
    expect(parseByteRange('bytes=0-1,4-5',1000)).toEqual({kind:'UNSATISFIABLE',size:1000});
  });
});

describe('streaming waveform aggregation',()=>{
  it('builds normalized min/max peaks at multiple resolutions across chunk boundaries',()=>{
    const aggregator=createPeakAggregator({sampleRate:1000,resolutionsMs:[100,250]});
    const samples=Int16Array.from(Array.from({length:500},(_,index)=>index<250?(index%2?16384:-32768):(index%2?8192:-8192)));
    const bytes=Buffer.from(samples.buffer);
    aggregator.push(bytes.subarray(0,333));
    aggregator.push(bytes.subarray(333));
    const result=aggregator.finish(500);
    expect(result.durationMs).toBe(500);
    expect(result.levels.map(level=>[level.bucketMs,level.peaks.length])).toEqual([[100,5],[250,2]]);
    expect(result.levels[0]?.peaks[0]).toEqual([-1,0.5]);
    expect(result.levels[1]?.peaks[1]).toEqual([-0.25,0.25]);
  });
});
