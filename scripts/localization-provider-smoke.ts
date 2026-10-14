import { randomUUID } from 'node:crypto';
import { loadConfig } from '../packages/config/src/index';
import { localizationSettingsSchema } from '../packages/contracts/src/index';
import {
  buildContextBatches,
  OpenAiLocalizationProvider,
  type LocalizationSnapshot,
  type LocalizationSource,
} from '../packages/localization/src/index';

const config = loadConfig();
const provider = new OpenAiLocalizationProvider({
  apiKey: config.LOCALIZATION_PROVIDER === 'openai' ? config.LOCALIZATION_API_KEY : '',
  model: config.LOCALIZATION_PROVIDER === 'openai' ? config.LOCALIZATION_MODEL : '',
  baseUrl: config.LOCALIZATION_BASE_URL,
  timeoutMs: config.LOCALIZATION_TIMEOUT_MS,
  maxOutputTokens: config.LOCALIZATION_MAX_OUTPUT_TOKENS,
  maxAttempts: config.LOCALIZATION_MAX_ATTEMPTS,
  retryBaseMs: config.LOCALIZATION_RETRY_BASE_MS,
});

const readiness = provider.readiness();
if (config.LOCALIZATION_PROVIDER !== 'openai' || readiness.status !== 'READY') {
  console.info(JSON.stringify({
    event: 'real_localization_smoke_skipped',
    reason: config.LOCALIZATION_PROVIDER !== 'openai' ? 'provider_disabled' : 'credentials_or_model_missing',
  }));
  process.exit(0);
}

const settings = localizationSettingsSchema.parse({ batchSize: 2 });
const profile: LocalizationSnapshot['profile'] = {
  defaultMode: 'NATURAL',
  generalTone: 'Natural contemporary dialogue',
  setting: 'Original synthetic conversation',
  preferredStyle: 'Concise spoken Mongolian',
  formalityGuidance: 'Use context to preserve polite and casual address.',
  nameHandling: 'Keep names stable.',
  specialNotes: 'No copyrighted text.',
};

const corpora: { language: 'en' | 'zh'; lines: string[] }[] = [
  { language: 'en', lines: ['I never said I hated you.', 'Seriously? I waited here for three hours.'] },
  { language: 'zh', lines: ['我从来没说过我恨你。', '王爷，您真的要离开吗？'] },
];

for (const corpus of corpora) {
  const sources: LocalizationSource[] = corpus.lines.map((text, sequence) => ({
    id: randomUUID(), sequence, text, startMs: sequence * 2_500, endMs: sequence * 2_500 + 2_000,
    speaker: sequence ? 'SPEAKER_01' : 'SPEAKER_00', confidence: 0.95,
    reviewCategory: 'HIGH_CONFIDENCE', reviewStatus: 'UNREVIEWED', editRevision: 0,
  }));
  const snapshot: LocalizationSnapshot = {
    seriesId: randomUUID(), episodeId: randomUUID(), fusionRunId: randomUUID(),
    sourceLanguage: corpus.language, profile, characters: [], relationships: [], glossary: [],
    translationMemory: [], previousApprovedLines: [],
  };
  const batch = buildContextBatches(sources, snapshot, settings)[0]!;
  const draft = await provider.localize({ phase: 'DRAFT', mode: 'NATURAL', sourceLanguage: corpus.language, batch });
  const reviewed = await provider.localize({ phase: 'REVIEW', mode: 'NATURAL', sourceLanguage: corpus.language, batch, drafts: draft.segments });
  console.info(JSON.stringify({
    event: 'real_localization_smoke_completed',
    sourceLanguage: corpus.language,
    segmentCount: reviewed.segments.length,
    model: reviewed.model,
    inputTokens: [draft.usage.inputTokens, reviewed.usage.inputTokens],
    outputTokens: [draft.usage.outputTokens, reviewed.usage.outputTokens],
    cachedTokens: [draft.usage.cachedTokens, reviewed.usage.cachedTokens],
  }));
}
