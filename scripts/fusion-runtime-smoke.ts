import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {fusionRunSchema,transcriptPageSchema,transcriptDetailSchema,segmentPageSchema,idSchema} from '../packages/contracts/src/index';
const base=`http://127.0.0.1:${process.env.API_PORT??4000}`;
async function json(path:string,input?:unknown,method='POST'):Promise<unknown>{const response=await fetch(base+path,input===undefined?{}:{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});if(!response.ok)throw Error(`Compiled fusion smoke ${path} failed (${response.status}).`);return response.json();}
async function wait(id:string){for(let count=0;count<200;count++){const run=fusionRunSchema.parse(await json(`/fusion-runs/${id}`));if(run.status==='FAILED'||run.status==='CANCELLED')throw Error(`Fusion smoke failed ${run.job.errorCode}`);if(run.status==='COMPLETED')return run;await new Promise(done=>setTimeout(done,100));}throw Error('Compiled fusion smoke timed out');}
const fixture=z.object({results:z.array(z.object({episodeId:idSchema,assetId:idSchema,language:z.enum(['en','zh-CN','zh-TW']),evidence:z.array(z.object({runId:idSchema}))}))}).parse(JSON.parse(await readFile('data/phase02-runtime-smoke.json','utf8')));
const output=[];
for(const source of fixture.results){
  const inputRunIds=source.evidence.map(e=>e.runId);
  const snapshots=await Promise.all(inputRunIds.map(async id=>segmentPageSchema.parse(await json(`/source-extractions/${id}/segments?limit=100`)).items));
  const input={mediaAssetId:source.assetId,inputRunIds,language:source.language==='en'?'ENGLISH':'CHINESE',rerunKey:randomUUID()};
  const created=fusionRunSchema.parse(await json(`/episodes/${source.episodeId}/fusion-runs`,input));const run=await wait(created.id);
  const page=transcriptPageSchema.parse(await json(`/fusion-runs/${run.id}/segments`));const first=page.items[0];if(!first||run.canonicalLanguage!==(source.language==='en'?'en':'zh')||!first.evidence.length)throw Error('Compiled canonical evidence missing.');
  if(source.language==='en'){
    const edited=transcriptDetailSchema.parse(await json(`/transcript-segments/${first.id}`,{expectedRevision:first.editRevision,text:first.text+' [manual verification]',reviewStatus:'APPROVED'},'PATCH'));
    if(edited.derivationType!=='MANUAL'||edited.derivedText!==first.derivedText)throw Error('Manual preservation failed.');
    await json(`/fusion-runs/${run.id}/activate`,{});
    const revision=fusionRunSchema.parse(await json(`/episodes/${source.episodeId}/fusion-runs`,{...input,rerunKey:randomUUID()}));await wait(revision.id);
    if(transcriptDetailSchema.parse(await json(`/transcript-segments/${first.id}`)).text!==edited.text)throw Error('Rerun overwrote manual correction.');
    if(fusionRunSchema.parse(await json(`/fusion-runs/${revision.id}`)).isActive)throw Error('Rerun silently changed active run.');
  }
  const after=await Promise.all(inputRunIds.map(async id=>segmentPageSchema.parse(await json(`/source-extractions/${id}/segments?limit=100`)).items));if(JSON.stringify(after)!==JSON.stringify(snapshots))throw Error('Source evidence mutated.');
  output.push({episodeId:source.episodeId,mediaAssetId:source.assetId,fusionRunId:run.id,canonicalLanguage:run.canonicalLanguage,inputRunIds,metrics:run.coverageMetrics,firstText:first.derivedText,alignmentDurationMs:run.alignmentDurationMs,reconciliationDurationMs:run.reconciliationDurationMs,persistenceDurationMs:run.persistenceDurationMs});
}
await writeFile('data/phase03-runtime-smoke.json',JSON.stringify(output,null,2));console.info(JSON.stringify({event:'compiled_fusion_runtime_smoke_passed',results:output}));
