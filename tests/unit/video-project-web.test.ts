import {describe,expect,it} from 'vitest';
import {ProjectClock,clipProjectEnd,formatProjectTime,visibleTimelineWindow} from '../../apps/web/lib/video-project';

describe('Phase 07 browser project clock and timeline windowing',()=>{
  it('anchors project time to performance time without depending on media currentTime',()=>{const clock=new ProjectClock();clock.seek(5000);clock.play(100);expect(clock.at(350)).toBe(5250);clock.pause(600);expect(clock.at(900)).toBe(5500);clock.play(1000,2);expect(clock.at(1250)).toBe(6000);});
  it('formats project time and maps rate-adjusted clip ends',()=>{expect(formatProjectTime(3_723_045)).toBe('01:02:03.045');expect(clipProjectEnd({timelineStartMs:1000,sourceInMs:500,sourceOutMs:2500,playbackRate:2})).toBe(2000);});
  it('returns only timeline items intersecting a padded viewport',()=>{const items=[{id:'a',startMs:0,endMs:1000},{id:'b',startMs:5000,endMs:7000},{id:'c',startMs:20_000,endMs:21_000}];expect(visibleTimelineWindow(items,5500,6000,1000).map(item=>item.id)).toEqual(['b']);});
});
