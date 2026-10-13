import {expect,it} from 'vitest';
import {fusionRequestSchema,fusionSettingsSchema,transcriptPatchSchema} from '../../packages/contracts/src/fusion';
it('accepts explicit evidence and materializes reproducible defaults',()=>{
  expect(fusionRequestSchema.parse({mediaAssetId:'00000000-0000-4000-8000-000000000000',inputRunIds:['00000000-0000-4000-8000-000000000001']})).toMatchObject({language:'AUTO'});
  expect(fusionSettingsSchema.parse({})).toHaveProperty('temporal.maximumGapMs',250);
});
it('requires explicit bounded input runs and rejects unsafe settings and empty manual edits',()=>{
  expect(()=>fusionRequestSchema.parse({mediaAssetId:'bad',inputRunIds:[]})).toThrow();
  expect(()=>fusionSettingsSchema.parse({temporal:{maximumGapMs:-1}})).toThrow();
  expect(()=>transcriptPatchSchema.parse({expectedRevision:0,startMs:100,endMs:50})).toThrow();
  expect(()=>transcriptPatchSchema.parse({expectedRevision:0})).toThrow();
});
