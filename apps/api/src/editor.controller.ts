import {createReadStream} from 'node:fs';
import {Body,Controller,Get,Headers,Inject,Param,Post,Query,Res} from '@nestjs/common';
import {parseByteRange} from '@mongolsub/editor';
import type {Response} from 'express';
import {StudioService} from './studio.service';

@Controller()
export class EditorController{
  constructor(@Inject(StudioService)private readonly studio:StudioService){}
  @Get('episodes/:id/subtitle-documents')list(@Param('id')id:string,@Query()query:unknown){return this.studio.editor.listDocuments(id,query);}
  @Post('localization-runs/:id/subtitle-documents')create(@Param('id')id:string,@Body()input:unknown){return this.studio.editor.createDocument(id,input);}
  @Get('subtitle-documents/:id')detail(@Param('id')id:string){return this.studio.editor.detail(id);}
  @Post('subtitle-documents/:id/activate')activate(@Param('id')id:string){return this.studio.editor.activate(id);}
  @Get('subtitle-documents/:id/cues')cues(@Param('id')id:string,@Query()query:unknown){return this.studio.editor.listCues(id,query);}
  @Get('subtitle-cues/:id')cue(@Param('id')id:string){return this.studio.editor.getCue(id);}
  @Post('subtitle-cues/:id/rewrite')rewrite(@Param('id')id:string,@Body()input:unknown){return this.studio.editor.rewrite(id,input);}
  @Post('editor-rewrite-proposals/:id/reject')rejectRewrite(@Param('id')id:string,@Body()input:unknown){return this.studio.editor.rejectRewrite(id,input);}
  @Post('subtitle-documents/:id/operations')operate(@Param('id')id:string,@Body()input:unknown){return this.studio.editor.operate(id,input);}
  @Post('subtitle-documents/:id/undo')undo(@Param('id')id:string,@Body()input:unknown){return this.studio.editor.undo(id,input);}
  @Post('subtitle-documents/:id/redo')redo(@Param('id')id:string,@Body()input:unknown){return this.studio.editor.redo(id,input);}
  @Post('subtitle-documents/:id/media/prepare')prepare(@Param('id')id:string){return this.studio.editor.ensureEditorMedia(id);}
  @Post('subtitle-documents/:id/media/cancel')cancelMedia(@Param('id')id:string,@Body()input:unknown){return this.studio.editor.cancelEditorMedia(id,input);}
  @Get('subtitle-documents/:id/waveform')waveform(@Param('id')id:string){return this.studio.editor.waveform(id);}
  @Get('subtitle-documents/:id/playback')
  async playback(@Param('id')id:string,@Headers('range')rangeHeader:string|undefined,@Res()response:Response){
    const media=await this.studio.editor.resolvePlayback(id);const range=parseByteRange(rangeHeader,Number(media.sizeBytes));
    response.setHeader('Accept-Ranges','bytes');response.setHeader('Content-Type',media.mimeType);response.setHeader('Cache-Control','private, max-age=300');
    if(range.kind==='UNSATISFIABLE'){response.status(416).setHeader('Content-Range',`bytes */${range.size}`).end();return;}
    response.status(range.kind==='PARTIAL'?206:200);response.setHeader('Content-Length',String(range.length));if(range.kind==='PARTIAL')response.setHeader('Content-Range',`bytes ${range.start}-${range.end}/${media.sizeBytes}`);
    const lease=await this.studio.storage.materialize(media.storageKey);const stream=createReadStream(lease.path,{start:range.start,end:range.end});let released=false;const release=()=>{if(released)return;released=true;void lease.release();};stream.once('close',release);stream.once('error',error=>{release();response.destroy(error);});response.once('close',release);stream.pipe(response);
  }
}
