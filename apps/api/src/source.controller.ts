import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { StudioService } from './studio.service';
@Controller()
export class SourceController {
  constructor(@Inject(StudioService) private readonly studio:StudioService) {}
  @Get('providers/readiness') readiness(){return this.studio.sources.readiness();}
  @Get('episodes/:id/source-extractions') list(@Param('id') id:string,@Query() query:unknown){return this.studio.sources.list(id,query);}
  @Post('episodes/:id/source-extractions/embedded') embedded(@Param('id') id:string,@Body() input:unknown){return this.studio.sources.create(id,'EMBEDDED_SUBTITLE',input);}
  @Post('episodes/:id/source-extractions/asr') asr(@Param('id') id:string,@Body() input:unknown){return this.studio.sources.create(id,'ASR',input);}
  @Post('episodes/:id/source-extractions/ocr') ocr(@Param('id') id:string,@Body() input:unknown){return this.studio.sources.create(id,'OCR',input);}
  @Get('source-extractions/:id') run(@Param('id') id:string){return this.studio.sources.detail(id);}
  @Get('source-extractions/:id/segments') segments(@Param('id') id:string,@Query() query:unknown){return this.studio.sources.segments(id,query);}
  @Post('source-extractions/:id/cancel') cancel(@Param('id') id:string){return this.studio.sources.cancel(id);}
}
