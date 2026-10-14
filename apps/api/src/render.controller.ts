import {createReadStream} from 'node:fs';
import {Body,Controller,Get,Headers,Inject,Param,Post,Query,Res} from '@nestjs/common';
import type {Response} from 'express';
import {parseByteRange} from '@mongolsub/editor';
import {StudioService} from './studio.service';
function attachmentName(value:string){const safe=value.replace(/["\r\n]/g,'_'),ascii=safe.replace(/[^\x20-\x7E]/g,'_');return`attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;}
@Controller()
export class RenderController{
  constructor(@Inject(StudioService)private studio:StudioService){}
  @Get('video-projects/:id/render-capabilities')capabilities(){return this.studio.renders.capabilities();}
  @Post('video-projects/:id/render-jobs')create(@Param('id')id:string,@Body()input:unknown){return this.studio.renders.create(id,input);}
  @Get('video-projects/:id/render-jobs')list(@Param('id')id:string,@Query()query:unknown){return this.studio.renders.list(id,query);}
  @Get('render-jobs/:id')detail(@Param('id')id:string){return this.studio.renders.detail(id);}
  @Post('render-jobs/:id/cancel')cancel(@Param('id')id:string){return this.studio.renders.cancel(id);}
  @Get('render-jobs/:id/outputs')async outputs(@Param('id')id:string){return(await this.studio.renders.detail(id)).outputs;}
  @Get('render-outputs/:id/content')async content(@Param('id')id:string,@Headers('range')header:string|undefined,@Res()response:Response){const output=await this.studio.renders.output(id);const range=parseByteRange(header,Number(output.sizeBytes));response.setHeader('Accept-Ranges','bytes');response.setHeader('Content-Type',output.mimeType);response.setHeader('Content-Disposition',attachmentName(output.filename));if(range.kind==='UNSATISFIABLE'){response.status(416).setHeader('Content-Range',`bytes */${range.size}`).end();return;}response.status(range.kind==='PARTIAL'?206:200);response.setHeader('Content-Length',String(range.length));if(range.kind==='PARTIAL')response.setHeader('Content-Range',`bytes ${range.start}-${range.end}/${String(output.sizeBytes)}`);const lease=await this.studio.storage.materialize(output.storageKey);const stream=createReadStream(lease.path,{start:range.start,end:range.end});const release=()=>void lease.release();stream.once('close',release);stream.once('error',error=>{release();response.destroy(error);});response.once('close',release);stream.pipe(response);}
}
