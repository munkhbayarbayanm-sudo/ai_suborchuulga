import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaClient } from '../../packages/database/src/index';
import { loadConfig } from '../../packages/config/src/index';
import { AppError } from '../../packages/domain/src/index';
import {
  characterPageSchema,
  characterSchema,
  glossaryEntrySchema,
  localizationPageSchema,
  localizationProviderReadinessSchema,
  localizationRunSchema,
  localizedSegmentPageSchema,
  localizedSegmentSchema,
  relationshipSchema,
  seriesLocalizationProfileSchema,
  translationMemoryPageSchema,
  type LocalizationReason,
} from '../../packages/contracts/src/index';
import { createApi } from '../../apps/api/src/app';
import { createInspectionWorker } from '../../apps/worker/src/worker';
import type { TranslationInput, TranslationProvider, TranslationResult } from '../../packages/localization/src/index';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');

class DeterministicLocalizationProvider implements TranslationProvider {
  readonly calls: { phase: TranslationInput['phase']; ids: string[]; sourceLanguage: 'en' | 'zh'; mode: string }[] = [];
  failReviewStartingAtSequence: number | null = null;

  readiness() {
    return { status: 'READY' as const, message: 'Deterministic integration fixture is ready.', provider: 'deterministic-test', model: 'fixture-v1' };
  }

  private translate(text: string, review: boolean): string {
    const translations: Record<string, string> = {
      'I never said I hated you.': 'Би чамайг үзэн яддаг гэж хэзээ ч хэлээгүй.',
      'Seriously?': review ? 'Нээрээ юу?' : 'Ноцтой юу?',
      'Your Majesty, Arthur will return in 3 hours.': 'Эрхэм дээдэс ээ, Артур 3 цагийн дараа ирнэ.',
      'Leave me.': 'Ганцааранг минь орхи.',
      'This source line is uncertain.': 'Энэ эх өгүүлбэр эргэлзээтэй.',
      '我从来没说过我恨你。': 'Би чамайг үзэн яддаг гэж хэзээ ч хэлээгүй.',
      '王爷，您真的要离开吗？': 'Ван ноён оо, та үнэхээр явах гэж байна уу?',
      '算了。': 'Больё доо.',
    };
    return translations[text] ?? 'Орчуулгын туршилтын мөр.';
  }

  async localize(input: TranslationInput, signal?: AbortSignal): Promise<TranslationResult> {
    if (signal?.aborted) throw new AppError('LOCALIZATION_CANCELLED', 'Cancelled.', 409);
    const ids = input.batch.targets.map((target) => target.id);
    this.calls.push({ phase: input.phase, ids, sourceLanguage: input.sourceLanguage, mode: input.mode });
    if (input.phase === 'REVIEW' && this.failReviewStartingAtSequence !== null && input.batch.targets[0]!.sequence === this.failReviewStartingAtSequence) {
      this.failReviewStartingAtSequence = null;
      throw new AppError('LOCALIZATION_PROVIDER_TRANSIENT', 'Synthetic one-shot review failure.', 503);
    }
    return {
      model: 'fixture-v1-actual',
      providerVersion: 'fixture-provider-1',
      usage: { inputTokens: input.phase === 'DRAFT' ? 40 : 30, outputTokens: input.phase === 'DRAFT' ? 20 : 15, cachedTokens: 0 },
      segments: input.batch.targets.map((target) => {
        const issues: LocalizationReason[] = target.text.includes('uncertain')
          ? [{ code: 'SOURCE_UNCERTAIN', severity: 'REVIEW', message: 'Synthetic source uncertainty.' }]
          : [];
        return {
          segmentId: target.id,
          translation: this.translate(target.text, input.phase === 'REVIEW'),
          providerConfidence: target.text.includes('uncertain') ? 0.55 : 0.95,
          issues,
          alternativeTranslation: target.text === 'Seriously?' && input.phase === 'REVIEW' ? 'Үнэн гэж үү?' : null,
          suggestedLineBreak: null,
        };
      }),
    };
  }
}

describe('Phase 04 real API/PostgreSQL/BullMQ with deterministic provider', () => {
  const config = loadConfig();
  const db = new PrismaClient({ datasourceUrl: config.DATABASE_URL });
  const provider = new DeterministicLocalizationProvider();
  let app: Awaited<ReturnType<typeof createApi>>;
  let worker: Awaited<ReturnType<typeof createInspectionWorker>>;
  let baseUrl = '';
  let seriesId = '';
  let episodeId = '';
  let englishFusionId = '';
  let chineseFusionId = '';
  let characterId = '';
  let localizationId = '';
  let firstLocalizedId = '';
  let canonicalSnapshot = '';

  async function createFusion(language: 'en' | 'zh', lines: { text: string; reviewCategory?: 'HIGH_CONFIDENCE' | 'REVIEW_RECOMMENDED' | 'LIKELY_PROBLEM' }[]) {
    const asset = await db.mediaAsset.create({ data: {
      episodeId, originalFilename: `${language}-synthetic.mkv`, storageKey: randomUUID(), mimeType: 'video/x-matroska',
      sizeBytes: 1n, durationMs: lines.length * 2_500, status: 'READY',
    } });
    const job = await db.processingJob.create({ data: { episodeId, mediaAssetId: asset.id, jobType: 'FUSE_TRANSCRIPT', status: 'COMPLETED', progress: 100, completedAt: new Date() } });
    const fusion = await db.fusionRun.create({ data: {
      episodeId, mediaAssetId: asset.id, requestedLanguage: language === 'en' ? 'ENGLISH' : 'CHINESE', canonicalLanguage: language,
      languageReason: 'Synthetic Phase 04 canonical fixture.', status: 'COMPLETED', algorithmVersion: 'fusion-v1', settings: {},
      identityHash: digest(randomUUID()), overallConfidence: 0.9, coverageMetrics: {}, processingJobId: job.id,
      stage: 'Completed', completedAt: new Date(),
    } });
    await db.transcriptSegment.createMany({ data: lines.map((line, sequence) => ({
      fusionRunId: fusion.id, sequence, startMs: sequence * 2_500, endMs: sequence * 2_500 + 2_000,
      text: line.text, derivedStartMs: sequence * 2_500, derivedEndMs: sequence * 2_500 + 2_000,
      derivedText: line.text, language, speaker: sequence % 2 ? 'SPEAKER_01' : 'SPEAKER_00', confidence: line.reviewCategory === 'LIKELY_PROBLEM' ? 0.4 : 0.94,
      reviewCategory: line.reviewCategory ?? 'HIGH_CONFIDENCE', reviewStatus: 'UNREVIEWED', derivationType: 'DIRECT', confidenceReasons: {},
    })) });
    return fusion.id;
  }

  async function call(path: string, method: 'GET' | 'POST' | 'PATCH' = 'GET', body?: unknown) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    });
    const value = await response.json() as unknown;
    return { response, value };
  }

  async function waitForRun(id: string, terminal: string[] = ['COMPLETED', 'FAILED', 'CANCELLED']) {
    for (let attempt = 0; attempt < 300; attempt++) {
      const result = await call(`/localization-runs/${id}`);
      const run = localizationRunSchema.parse(result.value);
      if (terminal.includes(run.status)) return run;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('Localization run did not reach a terminal state.');
  }

  beforeAll(async () => {
    const series = await db.series.create({ data: { title: 'Phase 04 deterministic localization', sourceLanguage: 'en' } });
    seriesId = series.id;
    const episode = await db.episode.create({ data: { seriesId, title: 'Synthetic multilingual episode', sourceLanguage: 'en' } });
    episodeId = episode.id;
    englishFusionId = await createFusion('en', [
      { text: 'I never said I hated you.' },
      { text: 'Seriously?' },
      { text: 'Your Majesty, Arthur will return in 3 hours.' },
      { text: 'Leave me.' },
      { text: 'This source line is uncertain.', reviewCategory: 'LIKELY_PROBLEM' },
    ]);
    chineseFusionId = await createFusion('zh', [
      { text: '我从来没说过我恨你。' },
      { text: '王爷，您真的要离开吗？' },
      { text: '算了。' },
    ]);
    await db.episode.update({ where: { id: episodeId }, data: { activeFusionRunId: englishFusionId } });
    canonicalSnapshot = JSON.stringify(await db.transcriptSegment.findMany({ where: { fusionRun: { episodeId } }, orderBy: [{ fusionRunId: 'asc' }, { sequence: 'asc' }] }));
    app = await createApi(config, undefined, provider);
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    worker = await createInspectionWorker(config, undefined, provider);
  });

  afterAll(async () => {
    if (worker) await worker.close();
    if (app) await app.close();
    if (seriesId) await db.series.delete({ where: { id: seriesId } });
    await db.$disconnect();
  });

  it('manages explicit series profile, characters, relationships, glossary and imported TM', async () => {
    const profileInput = { defaultMode: 'NATURAL', generalTone: 'Restrained romance', setting: 'Historical court', preferredStyle: 'Natural spoken Mongolian', formalityGuidance: 'Subordinates use formal address.', nameHandling: 'Use approved names.', specialNotes: '' };
    expect(seriesLocalizationProfileSchema.parse((await call(`/series/${seriesId}/localization-profile`, 'PATCH', profileInput)).value)).toEqual(profileInput);
    const arthur = characterSchema.parse((await call(`/series/${seriesId}/characters`, 'POST', { canonicalName: 'Arthur', sourceName: 'Arthur', mongolianName: 'Артур', role: 'ruler', title: 'King', speakingStyle: 'reserved', formality: 'formal', notes: '', aliases: ['King Arthur'] })).value);
    const guard = characterSchema.parse((await call(`/series/${seriesId}/characters`, 'POST', { canonicalName: 'Guard', sourceName: 'Guard', role: 'subordinate', aliases: [] })).value);
    characterId = arthur.id;
    expect(characterPageSchema.parse((await call(`/series/${seriesId}/characters`)).value).total).toBe(2);
    expect(relationshipSchema.parse((await call(`/series/${seriesId}/relationships`, 'POST', { fromCharacterId: guard.id, toCharacterId: arthur.id, type: 'subordinate', notes: 'Formal military relationship.' })).value).type).toBe('subordinate');
    expect(glossaryEntrySchema.parse((await call(`/series/${seriesId}/glossary`, 'POST', { scope: 'SERIES', seriesId, episodeId: null, characterId: null, sourceLanguage: 'en', sourceTerm: 'Your Majesty', preferredMongolian: 'Эрхэм дээдэс', notes: 'Formal address.', caseSensitive: false, status: 'ACTIVE' })).value).scope).toBe('SERIES');
    const imported = await call(`/series/${seriesId}/translation-memory`, 'POST', { sourceLanguage: 'en', sourceText: 'Leave me.', mongolianText: 'Ганцааранг минь орхи.', characterId: null, origin: 'IMPORTED', status: 'TRUSTED', sourceLocalizedSegmentId: null, sourceRevision: null });
    expect(imported.response.status).toBe(201);
    const forged = await call(`/series/${seriesId}/translation-memory`, 'POST', { sourceLanguage: 'en', sourceText: 'Fake', mongolianText: 'Хуурамч', characterId: null, origin: 'HUMAN_APPROVED', status: 'TRUSTED', sourceLocalizedSegmentId: null, sourceRevision: null });
    expect(forged.response.status).toBe(400);
  });

  it('runs bounded English draft/review batches, deduplicates clicks and preserves canonical evidence', async () => {
    expect(localizationProviderReadinessSchema.parse((await call('/localization/providers/readiness')).value)).toMatchObject({ status: 'READY', provider: 'deterministic-test' });
    const request = { fusionRunId: englishFusionId, mode: 'NATURAL', settings: { batchSize: 2, contextBefore: 3, contextAfter: 3, maxContextCharacters: 24_000, speakerBindings: [{ speaker: 'SPEAKER_00', characterId }] } };
    const created = await Promise.all([call(`/episodes/${episodeId}/localization-runs`, 'POST', request), call(`/episodes/${episodeId}/localization-runs`, 'POST', request)]);
    expect(created.map(({ response }) => response.status)).toEqual([201, 201]);
    const ids = created.map(({ value }) => localizationRunSchema.parse(value).id);
    expect(ids[0]).toBe(ids[1]);
    localizationId = ids[0]!;
    const run = await waitForRun(localizationId);
    expect(run).toMatchObject({ status: 'COMPLETED', mode: 'NATURAL', sourceLanguage: 'en', targetLanguage: 'mn', segmentCount: 5, completedSegmentCount: 5, batchCount: 3, completedBatchCount: 3, inputTokens: 210, outputTokens: 105, cachedTokens: 0, usageComplete: true, isActive: false });
    expect(run.processingDurationMs).not.toBeNull();
    const page = localizedSegmentPageSchema.parse((await call(`/localization-runs/${localizationId}/segments?limit=2`)).value);
    expect(page.total).toBe(5);
    expect(page.items[0]?.machineDraft).toContain('хэзээ ч');
    expect(page.items[1]).toMatchObject({ machineDraft: 'Ноцтой юу?', currentText: 'Нээрээ юу?', editState: 'AI_REVISED', humanReviewState: 'UNREVIEWED' });
    firstLocalizedId = page.items[0]!.id;
    expect(localizedSegmentPageSchema.parse((await call(`/localization-runs/${localizationId}/segments?filter=LIKELY_PROBLEM`)).value).total).toBe(1);
    expect(provider.calls.filter((entry) => entry.phase === 'DRAFT').map((entry) => entry.ids.length)).toEqual([2, 2, 1]);
    expect(provider.calls.every((entry) => entry.ids.length <= 2)).toBe(true);
    expect(JSON.stringify(await db.transcriptSegment.findMany({ where: { fusionRun: { episodeId } }, orderBy: [{ fusionRunId: 'asc' }, { sequence: 'asc' }] }))).toBe(canonicalSnapshot);
    const invalidBinding = await call(`/episodes/${episodeId}/localization-runs`, 'POST', { fusionRunId: englishFusionId, rerunKey: randomUUID(), settings: { speakerBindings: [{ speaker: 'SPEAKER_00', characterId: randomUUID() }] } });
    expect(invalidBinding.response.status).toBe(400);
  });

  it('protects manual edits, keeps machine draft, and turns explicit approval into revision-bound trusted TM', async () => {
    const original = localizedSegmentSchema.parse((await call(`/localized-segments/${firstLocalizedId}`)).value);
    const edited = localizedSegmentSchema.parse((await call(`/localized-segments/${firstLocalizedId}`, 'PATCH', { expectedRevision: original.revision, currentText: 'Би чамайг үзэн яддаг гэж огт хэлээгүй.' })).value);
    expect(edited).toMatchObject({ currentText: 'Би чамайг үзэн яддаг гэж огт хэлээгүй.', machineDraft: original.machineDraft, editState: 'MANUALLY_EDITED', humanReviewState: 'UNREVIEWED', revision: original.revision + 1 });
    expect((await call(`/localized-segments/${firstLocalizedId}`, 'PATCH', { expectedRevision: original.revision, currentText: 'Хоцорсон өөрчлөлт.' })).response.status).toBe(409);
    const approved = localizedSegmentSchema.parse((await call(`/localized-segments/${firstLocalizedId}/approve`, 'POST', { expectedRevision: edited.revision })).value);
    expect(approved).toMatchObject({ humanReviewState: 'APPROVED', revision: edited.revision + 1, machineDraft: original.machineDraft });
    let memory = translationMemoryPageSchema.parse((await call(`/series/${seriesId}/translation-memory?limit=100`)).value);
    const trusted = memory.items.find((entry) => entry.sourceLocalizedSegmentId === firstLocalizedId && entry.status === 'TRUSTED');
    expect(trusted).toMatchObject({ origin: 'HUMAN_APPROVED', sourceRevision: approved.revision, mongolianText: approved.currentText });
    const duplicateImport = await call(`/series/${seriesId}/translation-memory`, 'POST', { sourceLanguage: trusted!.sourceLanguage, sourceText: trusted!.sourceText, mongolianText: trusted!.mongolianText, characterId: trusted!.characterId, origin: 'IMPORTED', status: 'TRUSTED', sourceLocalizedSegmentId: null, sourceRevision: null });
    expect(duplicateImport.response.status).toBe(201);
    expect(translationMemoryPageSchema.parse((await call(`/series/${seriesId}/translation-memory?limit=100`)).value).items.find((entry) => entry.id === trusted?.id)).toMatchObject({ origin: 'HUMAN_APPROVED', sourceLocalizedSegmentId: firstLocalizedId, sourceRevision: approved.revision });
    expect((await call(`/translation-memory/${trusted!.id}`, 'PATCH', { sourceLanguage: 'zh' })).response.status).toBe(409);
    const changed = localizedSegmentSchema.parse((await call(`/localized-segments/${firstLocalizedId}`, 'PATCH', { expectedRevision: approved.revision, currentText: 'Би тэгж хэлээгүй.' })).value);
    expect(changed.humanReviewState).toBe('UNREVIEWED');
    memory = translationMemoryPageSchema.parse((await call(`/series/${seriesId}/translation-memory?limit=100`)).value);
    expect(memory.items.find((entry) => entry.id === trusted?.id)?.status).toBe('ARCHIVED');
  });

  it('requires explicit activation and reruns without overwriting historical manual text', async () => {
    const activated = localizationRunSchema.parse((await call(`/localization-runs/${localizationId}/activate`, 'POST', {})).value);
    expect(activated.isActive).toBe(true);
    const rerun = localizationRunSchema.parse((await call(`/episodes/${episodeId}/localization-runs`, 'POST', { fusionRunId: englishFusionId, mode: 'STRICT', rerunKey: randomUUID(), settings: { batchSize: 5 } })).value);
    expect(rerun.id).not.toBe(localizationId);
    expect((await waitForRun(rerun.id)).isActive).toBe(false);
    expect(localizedSegmentSchema.parse((await call(`/localized-segments/${firstLocalizedId}`)).value).currentText).toBe('Би тэгж хэлээгүй.');
    expect(localizationPageSchema.parse((await call(`/episodes/${episodeId}/localization-runs?limit=1`)).value).activeRunId).toBe(localizationId);
  });

  it('preserves successful checkpoints through a failed batch and resumes without duplicate drafts', async () => {
    provider.failReviewStartingAtSequence = 2;
    const run = localizationRunSchema.parse((await call(`/episodes/${episodeId}/localization-runs`, 'POST', { fusionRunId: englishFusionId, mode: 'CINEMATIC', rerunKey: randomUUID(), settings: { batchSize: 2 } })).value);
    const failed = await waitForRun(run.id);
    expect(failed).toMatchObject({ status: 'FAILED', completedBatchCount: 1, completedSegmentCount: 2 });
    const batch = await db.localizationBatch.findFirstOrThrow({ where: { localizationRunId: run.id, batchIndex: 1 } });
    expect(batch.draftResults).not.toBeNull();
    const draftCallsBefore = provider.calls.filter((entry) => entry.phase === 'DRAFT' && entry.ids.includes((batch.targetSegmentIds as string[])[0]!)).length;
    const jobsBefore = await db.processingJob.count({ where: { episodeId, jobType: 'LOCALIZE_TRANSCRIPT' } });
    const resumes = await Promise.all([call(`/localization-runs/${run.id}/resume`, 'POST', {}), call(`/localization-runs/${run.id}/resume`, 'POST', {})]);
    expect(resumes.map((result) => result.response.status).sort()).toEqual([201, 409]);
    expect(await db.processingJob.count({ where: { episodeId, jobType: 'LOCALIZE_TRANSCRIPT' } })).toBe(jobsBefore + 1);
    const completed = await waitForRun(run.id);
    expect(completed).toMatchObject({ status: 'COMPLETED', completedBatchCount: 3, completedSegmentCount: 5 });
    const draftCallsAfter = provider.calls.filter((entry) => entry.phase === 'DRAFT' && entry.ids.includes((batch.targetSegmentIds as string[])[0]!)).length;
    expect(draftCallsAfter).toBe(draftCallsBefore);
  });

  it('cancels queued work without exposing finalized localization rows', async () => {
    await worker.close();
    try {
      const run = localizationRunSchema.parse((await call(`/episodes/${episodeId}/localization-runs`, 'POST', { fusionRunId: englishFusionId, mode: 'NATURAL', rerunKey: randomUUID(), settings: {} })).value);
      const cancelled = localizationRunSchema.parse((await call(`/localization-runs/${run.id}/cancel`, 'POST', {})).value);
      expect(cancelled.status).toBe('CANCELLED');
      expect((await call(`/localization-runs/${run.id}/activate`, 'POST', {})).response.status).toBe(409);
      expect(await db.localizedSegment.count({ where: { localizationRunId: run.id, currentText: { not: null } } })).toBe(0);
    } finally {
      worker = await createInspectionWorker(config, undefined, provider);
    }
  });

  it('runs Chinese to Mongolian through the same provider boundary without script conversion in source', async () => {
    const run = localizationRunSchema.parse((await call(`/episodes/${episodeId}/localization-runs`, 'POST', { fusionRunId: chineseFusionId, mode: 'NATURAL', rerunKey: randomUUID(), settings: { batchSize: 3 } })).value);
    expect((await waitForRun(run.id)).status).toBe('COMPLETED');
    const page = localizedSegmentPageSchema.parse((await call(`/localization-runs/${run.id}/segments?limit=100`)).value);
    expect(page.items.map((item) => item.sourceTextSnapshot)).toEqual(['我从来没说过我恨你。', '王爷，您真的要离开吗？', '算了。']);
    expect(page.items[1]?.currentText).toContain('Ван ноён');
    expect(page.items.every((item) => /\p{Script=Cyrillic}/u.test(item.currentText ?? ''))).toBe(true);
  });

  it('reports unavailable configuration without breaking earlier API functionality', async () => {
    const unavailable: TranslationProvider = {
      readiness: () => ({ status: 'MISCONFIGURED', message: 'Test provider is not configured.', provider: 'openai-responses', model: '' }),
      localize: async () => { throw new Error('must not be called'); },
    };
    const other = await createApi(config, undefined, unavailable);
    await other.listen(0, '127.0.0.1');
    try {
      const otherUrl = await other.getUrl();
      const readiness = await fetch(`${otherUrl}/localization/providers/readiness`);
      expect(localizationProviderReadinessSchema.parse(await readiness.json()).status).toBe('MISCONFIGURED');
      const health = await fetch(`${otherUrl}/health`);
      expect(health.status).toBe(200);
      const rejected = await fetch(`${otherUrl}/episodes/${episodeId}/localization-runs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fusionRunId: englishFusionId }) });
      expect(rejected.status).toBe(503);
    } finally {
      await other.close();
    }
  });
});
