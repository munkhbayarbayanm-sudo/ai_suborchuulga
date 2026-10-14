import {Body,Controller,Get,Inject,Param,Patch,Post,Query} from '@nestjs/common';
import {StudioService} from './studio.service';

@Controller()
export class LocalizationController {
  constructor(@Inject(StudioService) private readonly studio:StudioService){}
  @Get('localization/providers/readiness') readiness(){return this.studio.localizations.readiness();}
  @Get('episodes/:id/localization-runs') list(@Param('id')id:string,@Query()query:unknown){return this.studio.localizations.list(id,query);}
  @Post('episodes/:id/localization-runs') create(@Param('id')id:string,@Body()input:unknown){return this.studio.localizations.create(id,input);}
  @Get('localization-runs/:id') detail(@Param('id')id:string){return this.studio.localizations.detail(id);}
  @Get('localization-runs/:id/segments') segments(@Param('id')id:string,@Query()query:unknown){return this.studio.localizations.segments(id,query);}
  @Post('localization-runs/:id/activate') activate(@Param('id')id:string){return this.studio.localizations.activate(id);}
  @Post('localization-runs/:id/cancel') cancel(@Param('id')id:string){return this.studio.localizations.cancel(id);}
  @Post('localization-runs/:id/resume') resume(@Param('id')id:string){return this.studio.localizations.resume(id);}
  @Get('localized-segments/:id') segment(@Param('id')id:string){return this.studio.localizations.segment(id);}
  @Patch('localized-segments/:id') edit(@Param('id')id:string,@Body()input:unknown){return this.studio.localizations.edit(id,input);}
  @Post('localized-segments/:id/approve') approve(@Param('id')id:string,@Body()input:unknown){return this.studio.localizations.approve(id,input);}
}
