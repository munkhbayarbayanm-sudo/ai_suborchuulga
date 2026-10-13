import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '@mongolsub/database';
import type { Config } from '@mongolsub/config';
import { AppError, JobStatus, errorDiagnostics } from '@mongolsub/domain';
import { runSettingsSchema, segmentEvidenceSchema, segmentMetadataSchema, type SegmentEvidence, type SegmentMetadata } from '@mongolsub/contracts';
import { embeddedReadiness, extractSubtitle, groupOcr, normalizedLanguage, parseSubtitles, prepareAudio, sampleFrames, parseAsrResult, parseOcrResult, type ProviderSet, type OcrObservation } from '@mongolsub/extraction';
import type { StorageProvider } from '@mongolsub/storage';
type Evidence = SegmentEvidence & {providerMetadata:SegmentMetadata};
export async function processSourceExtraction(jobId:string,db:PrismaClient,storage:StorageProvider,config:Config,providers:ProviderSet):Promise<void> {
  const run=await db.sourceExtractionRun.findUniqueOrThrow({where:{processingJobId:jobId},include:{mediaAsset:{include:{streams:true}},processingJob:true}});
  if([JobStatus.COMPLETED,JobStatus.FAILED,JobStatus.CANCELLED].some(status=>status===run.processingJob.status)) return;
  const settings=runSettingsSchema.parse(run.settings);
  const started=Date.now(); const startedAt=new Date(started); const abort=new AbortController(); let polling=false;
  const timer=setInterval(()=>{if(polling)return;polling=true;void db.processingJob.findUnique({where:{id:jobId}}).then(job=>{if(job?.status===JobStatus.CANCELLED)abort.abort();}).catch(()=>{}).finally(()=>{polling=false;});},500);
  let directory:string|undefined;
  function check(){if(abort.signal.aborted)throw new AppError('CANCELLED','Source extraction was cancelled.');}
  function verifyProvider(provider:string,version:string|null,model:string|null) {
    if(provider!==run.provider||version!==run.providerVersion||model!==run.modelVersion)throw new AppError('PROVIDER_CONFIGURATION_CHANGED','Provider configuration changed after this run was queued. Start an intentional new extraction run.');
  }
  async function stage(label:string,progress:number) {
    check();
    await db.$transaction(async tx=>{
      const updated=await tx.processingJob.updateMany({where:{id:jobId,status:{in:[JobStatus.QUEUED,JobStatus.PROCESSING]}},data:{status:JobStatus.PROCESSING,progress,startedAt:run.processingJob.startedAt??startedAt}});
      if(!updated.count) throw new AppError('CANCELLED','Source extraction was cancelled.');
      await tx.sourceExtractionRun.update({where:{id:run.id},data:{status:JobStatus.PROCESSING,stage:label,startedAt:run.startedAt??startedAt}});
    });
  }
  try {
    await stage('Preparing source',5);
    await mkdir(resolve(config.MEDIA_WORK_ROOT),{recursive:true});
    directory=await mkdtemp(join(resolve(config.MEDIA_WORK_ROOT),`${run.id}-`));
    const lease=await storage.materialize(run.mediaAsset.storageKey);
    let evidence:Evidence[]=[]; let detected:string|null=null; let version=run.providerVersion; let model=run.modelVersion; let device:'cpu'|'gpu'='cpu';
    try {
      if(settings.method==='EMBEDDED_SUBTITLE') {
        const readiness=await embeddedReadiness(config.FFMPEG_PATH);
        verifyProvider(readiness.provider,readiness.version,readiness.model);
        const stream=run.mediaAsset.streams.find(s=>s.streamIndex===settings.streamIndex&&s.type==='SUBTITLE');
        if(!stream)throw new AppError('SUBTITLE_STREAM_NOT_FOUND','Selected subtitle stream is no longer available.');
        await stage('Extracting selected subtitle stream',20);
        const text=await extractSubtitle(lease.path,settings.streamIndex,config.FFMPEG_PATH,config.EXTRACTION_TIMEOUT_MS,abort.signal);
        detected=normalizedLanguage(stream.language);
        evidence=parseSubtitles(text,detected??settings.language).map(s=>({...s,providerMetadata:{provider:'ffmpeg',codec:stream.codec,trackLanguage:stream.language}}));
      } else if(settings.method==='ASR') {
        if(!run.mediaAsset.streams.some(s=>s.streamIndex===settings.streamIndex&&s.type==='AUDIO'))throw new AppError('AUDIO_STREAM_NOT_FOUND','Selected audio stream is no longer available.');
        const readiness=await providers.asr.readiness();
        if(readiness.state==='UNAVAILABLE')throw new AppError('DEPENDENCY_UNAVAILABLE','WhisperX is unavailable.');
        verifyProvider(readiness.provider,readiness.version,readiness.model);
        await stage('Preparing mono 16kHz audio',15);
        const cacheHash=createHash('sha256').update('mono-16000-pcm_s16le-timeline-v2').digest('hex');
        const lockKey=`${run.mediaAssetId}:${settings.streamIndex}:${cacheHash}`;
        let storedKey:string|undefined;
        let derivative;
        try {
          derivative=await db.$transaction(async tx=>{
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
            check();
            const cached=await tx.mediaDerivative.findUnique({where:{mediaAssetId_type_streamIndex_settingsHash:{mediaAssetId:run.mediaAssetId,type:'AUDIO_MONO_16K',streamIndex:settings.streamIndex,settingsHash:cacheHash}}});
            if(cached)return cached;
            const output=join(directory??'', 'normalized.wav');
            await prepareAudio(lease.path,settings.streamIndex,output,config.FFMPEG_PATH,config.EXTRACTION_TIMEOUT_MS,abort.signal);
            const stored=await storage.put(createReadStream(output),config.MAX_UPLOAD_BYTES); storedKey=stored.key;
            return tx.mediaDerivative.create({data:{mediaAssetId:run.mediaAssetId,type:'AUDIO_MONO_16K',streamIndex:settings.streamIndex,storageKey:stored.key,sizeBytes:stored.sizeBytes,settings:{channels:1,sampleRate:16000,codec:'pcm_s16le',timeline:'media-zero-pad-and-fill',version:2},settingsHash:cacheHash}});
          },{timeout:config.EXTRACTION_TIMEOUT_MS,maxWait:30000});
        } catch(error){if(storedKey)await storage.delete(storedKey);throw error;}
        check();
        const audio=await storage.materialize(derivative.storageKey);
        try {
          await stage('Transcribing audio (provider stage)',30);
          const result=parseAsrResult(await providers.asr.transcribe({runId:run.id,audioPath:audio.path,language:settings.language,align:settings.align,diarize:settings.diarize},abort.signal));
          verifyProvider(result.provider,result.providerVersion,result.modelVersion);
          version=result.providerVersion;model=result.modelVersion;device=result.device;detected=result.languageDetected;
          evidence=result.segments.map(s=>({...s,providerMetadata:{provider:'whisperx',model:result.modelVersion,warnings:result.warnings}}));
        } finally{await audio.release();}
      } else {
        const readiness=await providers.ocr.readiness();
        if(readiness.state==='UNAVAILABLE')throw new AppError('DEPENDENCY_UNAVAILABLE','PaddleOCR is unavailable.');
        verifyProvider(readiness.provider,readiness.version,readiness.model);
        const duration=run.mediaAsset.durationMs;
        if(!duration)throw new AppError('INVALID_MEDIA','OCR requires a known video duration.');
        await stage('Sampling subtitle-region frames',15);
        const frames=await sampleFrames(lease.path,directory,settings,duration,config.OCR_MAX_FRAMES,config.FFMPEG_PATH,config.EXTRACTION_TIMEOUT_MS,abort.signal);
        const observations:OcrObservation[]=[];
        for(let offset=0;offset<frames.length;offset+=32) {
          check(); await stage(`OCR frames ${offset} / ${frames.length}`,30+Math.floor(offset/Math.max(frames.length,1)*55));
          const batch=frames.slice(offset,offset+32);
          const result=parseOcrResult(await providers.ocr.recognize({runId:run.id,language:settings.language,frames:batch},abort.signal));
          verifyProvider(result.provider,result.providerVersion,result.modelVersion);
          if(result.observations.length!==batch.length||result.observations.some((o,i)=>o.timestampMs!==batch[i]?.timestampMs))throw new AppError('INVALID_PROVIDER_OUTPUT','OCR observations do not match the sampled frames.');
          version=result.providerVersion;model=result.modelVersion;device=result.device;observations.push(...result.observations);
        }
        evidence=groupOcr(observations,settings,duration,model??'PP-OCRv5');
      }
    } finally {await lease.release();}
    check();await stage('Saving independent source evidence',90);
    const normalized=evidence.map(s=>({...segmentEvidenceSchema.parse(s),providerMetadata:segmentMetadataSchema.parse(s.providerMetadata)})).sort((a,b)=>a.startMs-b.startMs);
    await db.$transaction(async tx=>{
      const updated=await tx.processingJob.updateMany({where:{id:jobId,status:JobStatus.PROCESSING},data:{status:JobStatus.COMPLETED,progress:100,completedAt:new Date(),errorCode:null,errorMessage:null}});
      if(!updated.count)throw new AppError('CANCELLED','Source extraction was cancelled before saving.');
      await tx.sourceSegment.deleteMany({where:{extractionRunId:run.id}});
      // Chunk DB writes; long episodes do not exceed parameter or transaction limits.
      for(let offset=0;offset<normalized.length;offset+=200) {
        const data=normalized.slice(offset,offset+200).map((s,i)=>({extractionRunId:run.id,startMs:s.startMs,endMs:s.endMs,text:s.text,language:s.language,confidence:s.confidence,speaker:s.speaker,sequence:offset+i,words:s.words,providerMetadata:s.providerMetadata} satisfies Prisma.SourceSegmentCreateManyInput));
        await tx.sourceSegment.createMany({data});
      }
      await tx.sourceExtractionRun.update({where:{id:run.id},data:{status:JobStatus.COMPLETED,stage:'Completed',providerVersion:version,modelVersion:model,languageDetected:detected,device,processingDurationMs:Date.now()-started,completedAt:new Date()}});
    },{timeout:30000});
    console.info(JSON.stringify({event:'source_extraction_completed',runId:run.id,jobId,mediaAssetId:run.mediaAssetId,method:run.method,device,segmentCount:normalized.length,sourceDurationMs:run.mediaAsset.durationMs,processingDurationMs:Date.now()-started}));
  } catch(error) {
    const failure=abort.signal.aborted?new AppError('CANCELLED','Source extraction was cancelled.'):error instanceof AppError?error:new AppError('PROCESS_FAILED','Source extraction could not complete. Check worker readiness.');
    // A disconnected/timed-out request can still be running in Python. Signal
    // cancellation on every failed inference run before removing temporary input.
    if(run.method==='ASR')await providers.asr.cancel(run.id);
    if(run.method==='OCR')await providers.ocr.cancel(run.id);
    await failSourceExtraction(jobId,db,failure.code,failure.message);
    console.error(JSON.stringify({event:'source_extraction_failed',runId:run.id,jobId,code:failure.code,diagnostics:{...errorDiagnostics(error),...failure.diagnostics}}));
    if(failure.code!=='CANCELLED')throw failure;
  } finally {clearInterval(timer);if(directory)await rm(directory,{recursive:true,force:true});}
}
export async function failSourceExtraction(jobId:string,db:PrismaClient,code:string,message:string) {
  await db.$transaction(async tx=>{
    const status=code==='CANCELLED'?JobStatus.CANCELLED:JobStatus.FAILED;
    const updated=await tx.processingJob.updateMany({where:{id:jobId,status:{in:[JobStatus.QUEUED,JobStatus.PROCESSING]}},data:{status,errorCode:code,errorMessage:message,completedAt:new Date()}});
    if(updated.count)await tx.sourceExtractionRun.updateMany({where:{processingJobId:jobId},data:{status,stage:status===JobStatus.CANCELLED?'Cancelled':'Failed',completedAt:new Date()}});
  });
}
