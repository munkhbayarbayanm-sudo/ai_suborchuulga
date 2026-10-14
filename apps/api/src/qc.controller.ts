import {Body,Controller,Get,Inject,Param,Patch,Post,Query} from '@nestjs/common';
import {StudioService} from './studio.service';

@Controller()
export class QCController{
  constructor(@Inject(StudioService)private readonly studio:StudioService){}
  @Get('qc-profiles')profiles(@Query('seriesId')seriesId:unknown){return this.studio.qc.listProfiles(seriesId);}
  @Post('qc-profiles')createProfile(@Body()input:unknown){return this.studio.qc.createProfile(input);}
  @Patch('qc-profiles/:id')patchProfile(@Param('id')id:string,@Body()input:unknown){return this.studio.qc.patchProfile(id,input);}
  @Post('series/:id/qc-profiles/:profileId/select')selectProfile(@Param('id')id:string,@Param('profileId')profileId:string){return this.studio.qc.selectSeriesProfile(id,profileId);}
  @Get('subtitle-documents/:id/qc-runs')documentRuns(@Param('id')id:string,@Query()query:unknown){return this.studio.qc.listDocumentRuns(id,query);}
  @Post('subtitle-documents/:id/qc-runs')createDocumentRun(@Param('id')id:string,@Body()input:unknown){return this.studio.qc.createDocumentRun(id,input);}
  @Post('subtitle-documents/:id/qc-preview')previewDocument(@Param('id')id:string,@Body()input:unknown){return this.studio.qc.previewDocument(id,input);}
  @Get('series/:id/qc-runs')seriesRuns(@Param('id')id:string,@Query()query:unknown){return this.studio.qc.listSeriesRuns(id,query);}
  @Post('series/:id/qc-runs')createSeriesRun(@Param('id')id:string,@Body()input:unknown){return this.studio.qc.createSeriesRun(id,input);}
  @Get('qc-runs/:id')run(@Param('id')id:string){return this.studio.qc.detail(id);}
  @Get('qc-runs/:id/issues')issues(@Param('id')id:string,@Query()query:unknown){return this.studio.qc.issues(id,query);}
  @Post('qc-runs/:id/cancel')cancel(@Param('id')id:string){return this.studio.qc.cancel(id);}
  @Patch('qc-issues/:id')patchIssue(@Param('id')id:string,@Body()input:unknown){return this.studio.qc.patchIssue(id,input);}
  @Post('qc-issues/:id/apply-suggestion')apply(@Param('id')id:string,@Body()input:unknown){return this.studio.qc.applySuggestion(id,input);}
}
