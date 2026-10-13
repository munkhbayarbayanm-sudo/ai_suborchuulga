import {Body,Controller,Get,Inject,Param,Patch,Post,Query} from '@nestjs/common';
import {StudioService} from './studio.service';
@Controller()
export class FusionController {
  constructor(@Inject(StudioService)private readonly studio:StudioService){}
  @Get('episodes/:id/fusion-runs')list(@Param('id')id:string,@Query()query:unknown){return this.studio.fusions.list(id,query);}
  @Post('episodes/:id/fusion-runs')create(@Param('id')id:string,@Body()input:unknown){return this.studio.fusions.create(id,input);}
  @Get('fusion-runs/:id')detail(@Param('id')id:string){return this.studio.fusions.detail(id);}
  @Get('fusion-runs/:id/segments')segments(@Param('id')id:string,@Query()query:unknown){return this.studio.fusions.segments(id,query);}
  @Get('transcript-segments/:id')segment(@Param('id')id:string){return this.studio.fusions.segment(id);}
  @Patch('transcript-segments/:id')edit(@Param('id')id:string,@Body()input:unknown){return this.studio.fusions.edit(id,input);}
  @Post('fusion-runs/:id/activate')activate(@Param('id')id:string){return this.studio.fusions.activate(id);}
  @Post('fusion-runs/:id/cancel')cancel(@Param('id')id:string){return this.studio.fusions.cancel(id);}
}
