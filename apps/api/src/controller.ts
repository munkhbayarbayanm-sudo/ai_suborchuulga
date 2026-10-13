import { Body, Controller, Get, Inject, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { StudioService } from './studio.service';
@Controller()
export class StudioController {
  constructor(@Inject(StudioService) private readonly studio: StudioService) {}
  @Get('health') health() { return this.studio.health(); }
  @Get('series') list() { return this.studio.listSeries(); }
  @Post('series') create(@Body() input: unknown) { return this.studio.createSeries(input); }
  @Get('series/:id') series(@Param('id') id: string) { return this.studio.getSeries(id); }
  @Patch('series/:id') patchSeries(@Param('id') id: string, @Body() input: unknown) { return this.studio.updateSeries(id, input); }
  @Post('series/:id/episodes') episode(@Param('id') id: string, @Body() input: unknown) { return this.studio.createEpisode(id, input); }
  @Get('episodes/:id') getEpisode(@Param('id') id: string) { return this.studio.getEpisode(id); }
  @Patch('episodes/:id') patchEpisode(@Param('id') id: string, @Body() input: unknown) { return this.studio.updateEpisode(id, input); }
  @Post('episodes/:id/media') import(@Param('id') id: string, @Req() request: Request) { return this.studio.importMedia(id, request); }
  @Get('media/:id') media(@Param('id') id: string) { return this.studio.getMedia(id); }
  @Get('jobs/:id') job(@Param('id') id: string) { return this.studio.getJob(id); }
}
