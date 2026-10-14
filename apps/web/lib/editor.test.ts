import {describe,expect,it,vi} from 'vitest';
import {canHandleEditorShortcut,discardDebouncedDrafts,startVideoFrameSync,visibleCueSlice} from './editor';

describe('Phase 05 editor browser helpers',()=>{
  it('never captures destructive shortcuts while typing or composing',()=>{
    expect(canHandleEditorShortcut({tagName:'TEXTAREA',isContentEditable:false,isComposing:false})).toBe(false);
    expect(canHandleEditorShortcut({tagName:'DIV',isContentEditable:true,isComposing:false})).toBe(false);
    expect(canHandleEditorShortcut({tagName:'DIV',isContentEditable:false,isComposing:true})).toBe(false);
    expect(canHandleEditorShortcut({tagName:'DIV',isContentEditable:false,isComposing:false})).toBe(true);
  });

  it('virtualizes a dense cue list with a bounded overscan window',()=>{
    expect(visibleCueSlice(1_200,4_800,44,6)).toEqual({start:103,end:126,offsetPx:4532});
    expect(visibleCueSlice(20,0,44,6)).toEqual({start:0,end:20,offsetPx:0});
  });

  it('uses requestVideoFrameCallback as the media clock and cancels cleanly',()=>{
    let callback:(now:number,metadata:{mediaTime:number})=>void=()=>{};
    const onFrame=vi.fn();
    const video={
      currentTime:0,
      requestVideoFrameCallback:vi.fn((next:typeof callback)=>{callback=next;return 7;}),
      cancelVideoFrameCallback:vi.fn(),
    };
    const stop=startVideoFrameSync(video,onFrame);
    callback(0,{mediaTime:1.25});
    expect(onFrame).toHaveBeenCalledWith(1250);
    expect(video.requestVideoFrameCallback).toHaveBeenCalledTimes(2);
    stop();
    expect(video.cancelVideoFrameCallback).toHaveBeenCalledWith(7);
  });

  it('discards debounced drafts without allowing their timers to submit later',()=>{
    vi.useFakeTimers();const submitted=vi.fn();const timers=new Map<string,ReturnType<typeof setTimeout>>();timers.set('cue-1',setTimeout(submitted,650) as unknown as ReturnType<typeof setTimeout>);const drafts=new Map([['cue-1',{text:'draft'}]]);discardDebouncedDrafts(timers,drafts);vi.advanceTimersByTime(700);expect(submitted).not.toHaveBeenCalled();expect(timers.size).toBe(0);expect(drafts.size).toBe(0);vi.useRealTimers();
  });
});
