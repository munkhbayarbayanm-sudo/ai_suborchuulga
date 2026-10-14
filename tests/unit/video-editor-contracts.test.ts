import {describe,expect,it} from 'vitest';
import {createVideoProjectSchema,videoOperationRequestSchema,videoProjectDetailSchema} from '../../packages/contracts/src/index';

const id='10000000-0000-4000-8000-000000000001';
describe('video editor contracts',()=>{
  it('validates project canvas presets and explicit subtitle document selection',()=>{expect(createVideoProjectSchema.parse({name:'Episode cut',canvasPreset:'9:16',activeSubtitleDocumentId:id})).toEqual({name:'Episode cut',canvasPreset:'9:16',activeSubtitleDocumentId:id});expect(()=>createVideoProjectSchema.parse({name:'',canvasPreset:'4:3'})).toThrow();});
  it('bounds crop, transform, color and audio parameters',()=>{expect(videoOperationRequestSchema.parse({type:'UPDATE_CLIP',baseRevision:2,payload:{clipId:id,changes:{cropX:0.1,cropY:0.1,cropWidth:0.8,cropHeight:0.8,volume:2,brightness:1.25}}}).type).toBe('UPDATE_CLIP');expect(()=>videoOperationRequestSchema.parse({type:'UPDATE_CLIP',baseRevision:2,payload:{clipId:id,changes:{cropX:0.8,cropWidth:0.5}}})).toThrow();expect(()=>videoOperationRequestSchema.parse({type:'MOVE_CLIP',baseRevision:-1,payload:{clipId:id,timelineStartMs:0}})).toThrow();});
  it('rejects giant Prisma-shaped project responses',()=>{expect(()=>videoProjectDetailSchema.parse({id,tracks:[],clips:[],assets:[],overlays:[],unexpected:{database:true}})).toThrow();});
});
