import { describe, expect, it } from 'vitest';
import { localizationSettingsSchema, type LocalizationReason } from '../../packages/contracts/src/index';
import {
  assessLocalization,
  buildContextBatches,
  buildLocalizationPrompt,
  type LocalizationSnapshot,
  type LocalizationSource,
} from '../../packages/localization/src/index';

const segment = (
  id: string,
  sequence: number,
  text: string,
  reviewCategory: LocalizationSource['reviewCategory'] = 'HIGH_CONFIDENCE',
): LocalizationSource => ({
  id,
  sequence,
  text,
  startMs: sequence * 2_000,
  endMs: sequence * 2_000 + 1_800,
  speaker: sequence % 2 ? 'SPEAKER_01' : 'SPEAKER_00',
  confidence: reviewCategory === 'HIGH_CONFIDENCE' ? 0.94 : 0.45,
  reviewCategory,
  reviewStatus: 'UNREVIEWED',
  editRevision: 0,
});

const snapshot = (sourceLanguage: 'en' | 'zh'): LocalizationSnapshot => ({
  seriesId: 'series',
  episodeId: 'episode',
  fusionRunId: 'fusion',
  sourceLanguage,
  profile: {
    defaultMode: 'NATURAL',
    generalTone: 'Emotionally restrained romance',
    setting: 'Historical court',
    preferredStyle: 'Natural contemporary Mongolian where the setting permits',
    formalityGuidance: 'A subordinate addresses a superior formally.',
    nameHandling: 'Keep approved Mongolian names stable.',
    specialNotes: '',
  },
  characters: [],
  relationships: [],
  glossary: [],
  translationMemory: [],
  previousApprovedLines: [],
});

const proposal = (issues: LocalizationReason[] = []) => ({
  segmentId: 'target',
  translation: 'Би буцаж ирэхгүй.',
  providerConfidence: 0.92,
  issues,
  alternativeTranslation: null,
  suggestedLineBreak: null,
});

describe('Phase 04 deterministic quality responsibilities', () => {
  it('builds coherent English context for negation, sarcasm, romance, formal and casual lines', () => {
    const sources = [
      segment('e0', 0, 'I never said I hated you.'),
      segment('e1', 1, 'Seriously?'),
      segment('e2', 2, 'Your Majesty, the guards are waiting.'),
      segment('e3', 3, 'Leave me.'),
      segment('e4', 4, 'I will come back for you.'),
      segment('e5', 5, 'No. Not this time.'),
      segment('e6', 6, 'We have exactly 3 hours.'),
    ];
    const batch = buildContextBatches(sources, snapshot('en'), localizationSettingsSchema.parse({ batchSize: 3 }))[1]!;
    expect(batch.targets.map((row) => row.id)).toEqual(['e3', 'e4', 'e5']);
    expect(batch.contextBefore.map((row) => row.id)).toEqual(['e0', 'e1', 'e2']);
    expect(batch.contextAfter.map((row) => row.id)).toEqual(['e6']);
    const natural = buildLocalizationPrompt({ phase: 'REVIEW', mode: 'NATURAL', sourceLanguage: 'en', batch, drafts: [] });
    expect(natural.user).toContain('Historical court');
    expect(natural.system).toContain('negation');
    expect(natural.system).toContain('Seriously?');
  });

  it('preserves Simplified and Traditional Chinese context and relationship-sensitive titles as data', () => {
    const sources = [
      segment('z0', 0, '陛下，臣不敢。'),
      segment('z1', 1, '王爷为什么还没有回来？'),
      segment('z2', 2, '師父，我真的沒騙你。'),
      segment('z3', 3, '哥哥，你要去哪儿？'),
      segment('z4', 4, '算了。'),
    ];
    const batch = buildContextBatches(sources, snapshot('zh'), localizationSettingsSchema.parse({ batchSize: 2 }))[0]!;
    const payload = buildLocalizationPrompt({ phase: 'DRAFT', mode: 'STRICT', sourceLanguage: 'zh', batch }).user;
    expect(payload).toContain('陛下');
    expect(payload).toContain('師父');
    expect(payload).not.toContain('Ван ноён');
  });

  it.each([
    ['NEGATION', 'Negation was inverted.'],
    ['PERSON', 'Speaker and listener were reversed.'],
    ['NUMBER', 'The number changed.'],
    ['NAME', 'The character name changed.'],
    ['RELATIONSHIP', 'The relationship term changed.'],
    ['MISSING_CLAUSE', 'A source clause is missing.'],
    ['INVENTED_FACT', 'A new story event was invented.'],
  ] as const)('forces severe %s review risks to likely problem', (code, message) => {
    const result = assessLocalization(
      segment('target', 0, "I won't return."),
      proposal([{ code, severity: 'SEVERE', message }]),
      [],
    );
    expect(result.reviewClassification).toBe('LIKELY_PROBLEM');
    expect(result.confidence).toBeLessThan(0.5);
  });

  it('checks glossary only on a source line containing that term', () => {
    const glossary = [{
      id: 'g', scope: 'SERIES' as const, seriesId: 'series', episodeId: null, characterId: null,
      sourceLanguage: 'zh' as const, sourceTerm: '王爷', preferredMongolian: 'Ван ноён', notes: '',
      caseSensitive: false, status: 'ACTIVE' as const,
    }];
    const unrelated = assessLocalization(segment('target', 0, '我会回来。'), proposal(), glossary);
    expect(unrelated.reasons.map((reason) => reason.code)).not.toContain('GLOSSARY_UNCERTAIN');
    const relevant = assessLocalization(segment('target', 0, '王爷回来了。'), proposal(), glossary);
    expect(relevant.reasons.map((reason) => reason.code)).toContain('GLOSSARY_UNCERTAIN');
  });

  it('propagates unreliable canonical source status even when Mongolian is fluent', () => {
    const result = assessLocalization(segment('target', 0, 'I am leaving.', 'LIKELY_PROBLEM'), proposal(), []);
    expect(result.reviewClassification).toBe('LIKELY_PROBLEM');
    expect(result.reasons.map((reason) => reason.code)).toContain('SOURCE_UNCERTAIN');
  });
});
