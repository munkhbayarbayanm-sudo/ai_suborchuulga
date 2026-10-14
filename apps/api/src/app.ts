import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Config } from '@mongolsub/config';
import { StudioController } from './controller';
import { StudioService } from './studio.service';
import { ApiErrors } from './errors';
import { SourceController } from './source.controller';
import {FusionController} from './fusion.controller';
import type { ProviderSet } from '@mongolsub/extraction';
import type {TranslationProvider} from '@mongolsub/localization';
import {LocalizationController} from './localization.controller';
import {MemoryController} from './memory.controller';
import {EditorController} from './editor.controller';
import {QCController} from './qc.controller';
import {VideoProjectController} from './video-project.controller';
export async function createApi(config: Config, providers?:ProviderSet, localizationProvider?:TranslationProvider) {
  @Module({ controllers: [StudioController,SourceController,FusionController,LocalizationController,MemoryController,EditorController,QCController,VideoProjectController], providers: [{ provide: StudioService, useFactory: () => new StudioService(config,providers,localizationProvider) }] })
  class ApiModule {}
  const app = await NestFactory.create(ApiModule, { logger: ['error', 'warn', 'log'] });
  const origins = [config.WEB_ORIGIN];
  const localOrigin = new URL(config.WEB_ORIGIN);
  if (localOrigin.hostname === '127.0.0.1' || localOrigin.hostname === 'localhost') {
    localOrigin.hostname = localOrigin.hostname === '127.0.0.1' ? 'localhost' : '127.0.0.1';
    origins.push(localOrigin.origin);
  }
  app.enableCors({ origin: origins, methods: ['GET', 'POST', 'PATCH'], allowedHeaders: ['Content-Type','Range'],exposedHeaders:['Accept-Ranges','Content-Range','Content-Length'] });
  app.useGlobalFilters(new ApiErrors());
  app.enableShutdownHooks();
  return app;
}
