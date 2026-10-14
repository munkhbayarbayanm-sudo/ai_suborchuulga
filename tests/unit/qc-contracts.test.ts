import {describe,expect,it} from 'vitest';
import {
  qcApplySuggestionRequestSchema,
  qcIssueFilterSchema,
  qcIssuePatchSchema,
  qcProfileInputSchema,
  qcRunCreateSchema,
} from '../../packages/contracts/src/qc';

const id='00000000-0000-4000-8000-000000000001';

describe('Phase 06 QC contracts',()=>{
  it('bounds profile thresholds and AI cost mode',()=>{
    expect(qcProfileInputSchema.parse({name:'Mongolian default',settings:{}}).settings.aiMode).toBe('OFF');
    expect(()=>qcProfileInputSchema.parse({name:'bad',settings:{maximumCharactersPerSecond:0}})).toThrow();
    expect(()=>qcProfileInputSchema.parse({name:'bad',settings:{maximumLineCount:99}})).toThrow();
  });

  it('validates explicit reruns and optional AI requirement',()=>{
    expect(qcRunCreateSchema.parse({profileId:id,aiMode:'PROBLEMATIC_ONLY',requireAi:false})).toMatchObject({profileId:id,aiMode:'PROBLEMATIC_ONLY',requireAi:false});
    expect(()=>qcRunCreateSchema.parse({profileId:id,rerunKey:'not-a-uuid'})).toThrow();
  });

  it('validates issue filters, ignore reasons and optimistic suggestion application',()=>{
    expect(qcIssueFilterSchema.parse({severity:'ERROR',state:'OPEN',limit:'25'})).toMatchObject({severity:'ERROR',state:'OPEN',limit:25});
    expect(()=>qcIssuePatchSchema.parse({state:'IGNORED',reason:' '.repeat(3)})).toThrow();
    expect(qcIssuePatchSchema.parse({state:'IGNORED',reason:'Intentional overlap.'})).toBeTruthy();
    expect(qcApplySuggestionRequestSchema.parse({suggestionId:id,baseRevision:4,clientOperationId:id})).toBeTruthy();
  });
});
