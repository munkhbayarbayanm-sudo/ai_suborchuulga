import type { Config } from '@mongolsub/config';
import { PrismaClient } from '@mongolsub/database';
import { AppError } from '@mongolsub/domain';
import { createEpisodeSchema, createSeriesSchema, idSchema, updateEpisodeSchema, updateSeriesSchema } from '@mongolsub/contracts';
import { toolAvailable } from '@mongolsub/media';
import { inspectionQueue, redisConnection, WORKER_HEARTBEAT } from '@mongolsub/queue';
import { LocalStorage, type StorageProvider } from '@mongolsub/storage';
import type { Request } from 'express';
import { toAsset, toEpisode, toJob, toSeries, toStream } from './dto';
import { receiveVideo } from './upload';
import { HttpProviders, type ProviderSet } from '@mongolsub/extraction';
import { SourceService } from './source.service';
import {FusionService} from './fusion.service';
import type {TranslationProvider} from '@mongolsub/localization';
import {LocalizationService,localizationProviderFromConfig} from './localization.service';
import {MemoryService} from './memory.service';
import {EditorService} from './editor.service';
import {QCService} from './qc.service';
import {VideoProjectService} from './video-project.service';
export class StudioService {
  readonly db: PrismaClient;
  readonly storage: StorageProvider;
  readonly redis;
  readonly queue;
  readonly sources:SourceService;
  readonly fusions:FusionService;
  readonly localizations:LocalizationService;
  readonly memory:MemoryService;
  readonly editor:EditorService;
  readonly qc:QCService;
  readonly videoProjects:VideoProjectService;
  constructor(readonly config: Config, providers:ProviderSet = new HttpProviders(config), localizationProvider?:TranslationProvider) {
    this.db = new PrismaClient({ datasourceUrl: config.DATABASE_URL });
    this.storage = new LocalStorage(config.STORAGE_ROOT);
    this.redis = redisConnection(config.REDIS_URL); this.queue = inspectionQueue(this.redis);
    this.sources = new SourceService(this.db,providers,config);
    this.fusions=new FusionService(this.db);
    this.memory=new MemoryService(this.db);
    const resolvedLocalizationProvider=localizationProvider??localizationProviderFromConfig(config);
    this.localizations=new LocalizationService(this.db,resolvedLocalizationProvider);
    this.editor=new EditorService(this.db,this.storage,config,resolvedLocalizationProvider);
    this.qc=new QCService(this.db,this.editor);
    this.videoProjects=new VideoProjectService(this.db,this.storage,config,this.editor);
  }
  async onModuleDestroy() { await this.queue.close(); this.redis.disconnect(); await this.db.$disconnect(); }
  async listSeries() { return (await this.db.series.findMany({ orderBy: { updatedAt: 'desc' }, take: 1000 })).map(toSeries); }
  async createSeries(input: unknown) { return toSeries(await this.db.series.create({ data: createSeriesSchema.parse(input) })); }
  async getSeries(rawId: string) {
    const id = idSchema.parse(rawId);
    const series = await this.db.series.findUnique({ where: { id }, include: { episodes: { orderBy: { createdAt: 'asc' } } } });
    if (!series) throw new AppError('SERIES_NOT_FOUND', 'Series not found.', 404);
    return { ...toSeries(series), episodes: series.episodes.map(toEpisode) };
  }
  async updateSeries(rawId: string, input: unknown) { const id = idSchema.parse(rawId); const data = updateSeriesSchema.parse(input); await this.getSeries(id); return toSeries(await this.db.series.update({ where: { id }, data })); }
  async createEpisode(rawId: string, input: unknown) { const seriesId = idSchema.parse(rawId); const data = createEpisodeSchema.parse(input); await this.getSeries(seriesId); return toEpisode(await this.db.episode.create({ data: { ...data, seriesId } })); }
  async getEpisode(rawId: string) {
    const id = idSchema.parse(rawId);
    const episode = await this.db.episode.findUnique({ where: { id }, include: { mediaAssets: { orderBy: { createdAt: 'asc' }, include: { streams: { orderBy: { streamIndex: 'asc' } } } }, jobs: { orderBy: { createdAt: 'desc' } } } });
    if (!episode) throw new AppError('EPISODE_NOT_FOUND', 'Episode not found.', 404);
    return { ...toEpisode(episode), mediaAssets: episode.mediaAssets.map(a => ({ ...toAsset(a), streams: a.streams.map(toStream) })), jobs: episode.jobs.map(toJob) };
  }
  async updateEpisode(rawId: string, input: unknown) { const id = idSchema.parse(rawId); const data = updateEpisodeSchema.parse(input); await this.getEpisode(id); return toEpisode(await this.db.episode.update({ where: { id }, data })); }
  async importMedia(rawId: string, request: Request) {
    const episodeId = idSchema.parse(rawId); await this.getEpisode(episodeId);
    const upload = await receiveVideo(request, this.storage, this.config.MAX_UPLOAD_BYTES);
    try {
      const result = await this.db.$transaction(async tx => {
        const asset = await tx.mediaAsset.create({ data: { episodeId, originalFilename: upload.filename, storageKey: upload.stored.key, mimeType: upload.mimeType, sizeBytes: upload.stored.sizeBytes } });
        const job = await tx.processingJob.create({ data: { episodeId, mediaAssetId: asset.id } });
        return { asset: toAsset(asset), job: toJob(job) };
      });
      // Durable job row is authoritative. Worker dispatches it even if Redis is offline now.
      return result;
    } catch (error) { await this.storage.delete(upload.stored.key); throw error; }
  }
  async getMedia(rawId: string) {
    const id = idSchema.parse(rawId);
    const asset = await this.db.mediaAsset.findUnique({ where: { id }, include: { streams: { orderBy: { streamIndex: 'asc' } }, jobs: { orderBy: { createdAt: 'desc' } } } });
    if (!asset) throw new AppError('MEDIA_NOT_FOUND', 'Media asset not found.', 404);
    return { ...toAsset(asset), streams: asset.streams.map(toStream), jobs: asset.jobs.map(toJob) };
  }
  async getJob(rawId: string) { const id = idSchema.parse(rawId); const job = await this.db.processingJob.findUnique({ where: { id } }); if (!job) throw new AppError('JOB_NOT_FOUND', 'Processing job not found.', 404); return toJob(job); }
  async health() {
    const bounded = async <T>(promise: Promise<T>): Promise<T> => {
      let timer: NodeJS.Timeout | undefined;
      try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Readiness timeout')), 3500); })]); }
      finally { clearTimeout(timer); }
    };
    const [database, redis, ffmpeg, ffprobe, heartbeat] = await Promise.all([
      bounded(this.db.$queryRaw`SELECT 1`).then(() => true, () => false),
      bounded(this.redis.ping()).then(() => true, () => false),
      toolAvailable(this.config.FFMPEG_PATH), toolAvailable(this.config.FFPROBE_PATH),
      bounded(this.redis.get(WORKER_HEARTBEAT)).catch(() => null)
    ]);
    const workerReady = heartbeat !== null && Number.isFinite(Date.parse(heartbeat)) && Date.now() - Date.parse(heartbeat) < 15000;
    return { status: database && redis && ffmpeg && ffprobe && workerReady ? 'ok' : 'degraded', database, redis, tools: { ffmpeg, ffprobe }, worker: { ready: workerReady, lastSeenAt: heartbeat } };
  }
}
