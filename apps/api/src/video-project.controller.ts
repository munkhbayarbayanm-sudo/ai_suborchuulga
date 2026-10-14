import {createReadStream} from 'node:fs';
import {Body,Controller,Get,Headers,Inject,Param,Post,Query,Req,Res} from '@nestjs/common';
import {parseByteRange} from '@mongolsub/editor';
import type {Request,Response} from 'express';
import {StudioService} from './studio.service';

@Controller()
export class VideoProjectController{
  constructor(@Inject(StudioService)private readonly studio:StudioService){}
  @Get('episodes/:id/video-projects')list(@Param('id')id:string,@Query()query:unknown){return this.studio.videoProjects.list(id,query);}
  @Post('episodes/:id/video-projects')create(@Param('id')id:string,@Body()input:unknown){return this.studio.videoProjects.create(id,input);}
  @Get('video-projects/:id')detail(@Param('id')id:string){return this.studio.videoProjects.detail(id);}
  @Get('video-projects/:id/timeline')timeline(@Param('id')id:string,@Query()query:unknown){return this.studio.videoProjects.timeline(id,query);}
  @Post('video-projects/:id/activate')activate(@Param('id')id:string){return this.studio.videoProjects.activate(id);}
  @Post('video-projects/:id/assets/reference')reference(@Param('id')id:string,@Body()input:unknown){return this.studio.videoProjects.referenceAsset(id,input);}
  @Post('video-projects/:id/assets')upload(@Param('id')id:string,@Req()request:Request){return this.studio.videoProjects.importAsset(id,request);}
  @Post('video-projects/:id/operations')operate(@Param('id')id:string,@Body()input:unknown){return this.studio.videoProjects.operate(id,input);}
  @Post('video-projects/:id/undo')undo(@Param('id')id:string,@Body()input:unknown){return this.studio.videoProjects.undo(id,input);}
  @Post('video-projects/:id/redo')redo(@Param('id')id:string,@Body()input:unknown){return this.studio.videoProjects.redo(id,input);}
  @Post('project-assets/:id/waveform/prepare')prepareWaveform(@Param('id')id:string){return this.studio.videoProjects.prepareWaveform(id);}
  @Get('project-assets/:id/waveform')waveform(@Param('id')id:string){return this.studio.videoProjects.waveform(id);}
  @Get('project-assets/:id/content')
  async content(@Param('id')id:string,@Headers('range')rangeHeader:string|undefined,@Res()response:Response){
    const media=await this.studio.videoProjects.resolveContent(id);const range=parseByteRange(rangeHeader,Number(media.sizeBytes));response.setHeader('Accept-Ranges','bytes');response.setHeader('Content-Type',media.mimeType);response.setHeader('Cache-Control','private, max-age=300');if(range.kind==='UNSATISFIABLE'){response.status(416).setHeader('Content-Range',`bytes */${range.size}`).end();return;}response.status(range.kind==='PARTIAL'?206:200);response.setHeader('Content-Length',String(range.length));if(range.kind==='PARTIAL')response.setHeader('Content-Range',`bytes ${range.start}-${range.end}/${media.sizeBytes}`);const lease=await this.studio.storage.materialize(media.storageKey);const stream=createReadStream(lease.path,{start:range.start,end:range.end});let released=false;const release=()=>{if(released)return;released=true;void lease.release();};stream.once('close',release);stream.once('error',error=>{release();response.destroy(error);});response.once('close',release);stream.pipe(response);
  }
}
