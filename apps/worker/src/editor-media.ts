import {createReadStream} from 'node:fs';
import {Readable} from 'node:stream';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import type {Config} from '@mongolsub/config';
import {Prisma,type PrismaClient} from '@mongolsub/database';
import {AppError,errorDiagnostics} from '@mongolsub/domain';
import {editorProxySettingsSchema,generateEditorProxy,generateWaveform,waveformSettingsSchema} from '@mongolsub/editor';
import type {StorageProvider} from '@mongolsub/storage';

const json=<T>(value:T)=>value as Prisma.InputJsonValue;
export async function processEditorMedia(jobId:string,db:PrismaClient,storage:StorageProvider,config:Config){
  const preparation=await db.editorMediaPreparation.findUniqueOrThrow({where:{processingJobId:jobId},include:{processingJob:true,mediaAsset:{include:{streams:true}}}});if(['COMPLETED','FAILED','CANCELLED'].includes(preparation.processingJob.status))return;
  const started=Date.now();const abort=new AbortController();let polling=false;let directory:string|undefined;let storedKey:string|undefined;let createdDerivativeId:string|undefined;
  const timer=setInterval(()=>{if(polling)return;polling=true;void db.processingJob.findUnique({where:{id:jobId},select:{status:true}}).then(job=>{if(job?.status==='CANCELLED')abort.abort();}).catch(()=>{}).finally(()=>{polling=false;});},250);
  const check=()=>{if(abort.signal.aborted)throw new AppError('CANCELLED','Editor media preparation cancelled.');};
  const stage=async(label:string,progress:number)=>{check();await db.$transaction(async tx=>{const job=await tx.processingJob.updateMany({where:{id:jobId,status:{in:['QUEUED','PROCESSING']}},data:{status:'PROCESSING',progress,startedAt:preparation.processingJob.startedAt??new Date(),errorCode:null,errorMessage:null}});if(!job.count)throw new AppError('CANCELLED','Editor media preparation cancelled.');await tx.editorMediaPreparation.update({where:{id:preparation.id},data:{status:'PROCESSING',stage:label,startedAt:preparation.startedAt??new Date()}});});};
  try{
    const durationMs=preparation.mediaAsset.durationMs;if(!durationMs)throw new AppError('MEDIA_DURATION_UNAVAILABLE','Editor media preparation requires inspected media duration.',409);
    const derivativeType=preparation.kind==='EDITOR_PROXY'?'EDITOR_PROXY_MP4':'WAVEFORM_PEAKS';const streamIndex=preparation.kind==='EDITOR_PROXY'?-1:waveformSettingsSchema.parse(preparation.settings).streamIndex;
    const cached=await db.mediaDerivative.findUnique({where:{mediaAssetId_type_streamIndex_settingsHash:{mediaAssetId:preparation.mediaAssetId,type:derivativeType,streamIndex,settingsHash:preparation.settingsHash}}});if(cached){await complete(preparation.id,jobId,cached.id,db);return;}
    await stage(preparation.kind==='EDITOR_PROXY'?'Preparing browser-safe preview':'Preparing waveform',5);await mkdir(resolve(config.MEDIA_WORK_ROOT),{recursive:true});directory=await mkdtemp(join(resolve(config.MEDIA_WORK_ROOT),`${preparation.id}-`));const lease=await storage.materialize(preparation.mediaAsset.storageKey);
    try{
      if(preparation.kind==='EDITOR_PROXY'){
        const settings=editorProxySettingsSchema.parse(preparation.settings);const output=join(directory,'editor-preview.mp4');await stage('Transcoding editor preview',15);await generateEditorProxy(lease.path,output,config.FFMPEG_PATH,config.MEDIA_PROCESS_TIMEOUT_MS,abort.signal);check();await stage('Saving editor preview',90);const stored=await storage.put(createReadStream(output),config.MAX_UPLOAD_BYTES);storedKey=stored.key;check();const derivative=await db.mediaDerivative.create({data:{mediaAssetId:preparation.mediaAssetId,type:'EDITOR_PROXY_MP4',streamIndex:-1,storageKey:stored.key,settings:json(settings),settingsHash:preparation.settingsHash,sizeBytes:stored.sizeBytes}});createdDerivativeId=derivative.id;check();await complete(preparation.id,jobId,derivative.id,db);storedKey=undefined;createdDerivativeId=undefined;
      }else{
        const settings=waveformSettingsSchema.parse(preparation.settings);if(!preparation.mediaAsset.streams.some(stream=>stream.type==='AUDIO'&&stream.streamIndex===settings.streamIndex))throw new AppError('AUDIO_STREAM_NOT_FOUND','Selected waveform audio stream is unavailable.',422);await stage('Decoding waveform peaks',15);const waveform=await generateWaveform(lease.path,settings,config.FFMPEG_PATH,config.MEDIA_PROCESS_TIMEOUT_MS,durationMs,abort.signal);check();await stage('Saving waveform peaks',90);const buffer=Buffer.from(JSON.stringify(waveform));const stored=await storage.put(Readable.from([buffer]),Math.min(config.MAX_UPLOAD_BYTES,16*1024*1024));storedKey=stored.key;check();const derivative=await db.mediaDerivative.create({data:{mediaAssetId:preparation.mediaAssetId,type:'WAVEFORM_PEAKS',streamIndex:settings.streamIndex,storageKey:stored.key,settings:json({...settings,durationMs,levelCount:waveform.levels.length}),settingsHash:preparation.settingsHash,sizeBytes:stored.sizeBytes}});createdDerivativeId=derivative.id;check();await complete(preparation.id,jobId,derivative.id,db);storedKey=undefined;createdDerivativeId=undefined;
      }
    }finally{await lease.release();}
    console.info(JSON.stringify({event:'editor_media_completed',preparationId:preparation.id,mediaAssetId:preparation.mediaAssetId,kind:preparation.kind,durationMs:Date.now()-started}));
  }catch(error){if(createdDerivativeId)await db.mediaDerivative.deleteMany({where:{id:createdDerivativeId}});if(storedKey)await storage.delete(storedKey);const failure=abort.signal.aborted?new AppError('CANCELLED','Editor media preparation cancelled.'):error instanceof AppError?error:new AppError('EDITOR_MEDIA_FAILED','Editor media preparation failed.');await failEditorMedia(jobId,db,failure.code,failure.message);console.error(JSON.stringify({event:'editor_media_failed',preparationId:preparation.id,kind:preparation.kind,code:failure.code,diagnostics:errorDiagnostics(error)}));if(failure.code!=='CANCELLED')throw failure;
  }finally{clearInterval(timer);if(directory)await rm(directory,{recursive:true,force:true});}
}

async function complete(preparationId:string,jobId:string,derivativeId:string,db:PrismaClient){await db.$transaction(async tx=>{const job=await tx.processingJob.updateMany({where:{id:jobId,status:{in:['QUEUED','PROCESSING']}},data:{status:'COMPLETED',progress:100,completedAt:new Date(),errorCode:null,errorMessage:null}});if(!job.count)throw new AppError('CANCELLED','Editor media preparation cancelled before completion.');await tx.editorMediaPreparation.update({where:{id:preparationId},data:{status:'COMPLETED',stage:'Completed',derivativeId,completedAt:new Date()}});});}
export async function failEditorMedia(jobId:string,db:PrismaClient,code:string,message:string){const status=code==='CANCELLED'?'CANCELLED':'FAILED';await db.$transaction(async tx=>{const job=await tx.processingJob.updateMany({where:{id:jobId,status:{in:['QUEUED','PROCESSING']}},data:{status,errorCode:code,errorMessage:message,completedAt:new Date()}});if(job.count)await tx.editorMediaPreparation.updateMany({where:{processingJobId:jobId},data:{status,stage:status==='CANCELLED'?'Cancelled':'Failed',completedAt:new Date()}});});}
