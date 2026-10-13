import { describe, expect, it } from 'vitest';
import { fusionSettingsSchema, confidenceReasonsSchema, coverageMetricsSchema } from '../../packages/contracts/src/index';
import { fuseTranscript, languageFamily, recommendLanguage, type FusionInput, type FusionEvidence } from '../../packages/fusion/src/index';

const settings = fusionSettingsSchema.parse({});
function segment(id: string, text = 'Hello', startMs = 1000, endMs = 2000, language: string | null = 'en', extra: Partial<FusionEvidence> = {}): FusionEvidence {
  return { id, extractionRunId: '', sequence: 0, text, startMs, endMs, language, confidence: 0.95, speaker: null, words: [], ...extra };
}
function input(id: string, method: FusionInput['method'], segments: FusionEvidence[]): FusionInput {
  return { id, method, segments: segments.map((s, sequence) => ({ ...s, extractionRunId: id, sequence })) };
}
const run = (inputs: FusionInput[], language: 'en' | 'zh' = 'en') => fuseTranscript(inputs, settings, language, 4000);

describe('deterministic source fusion', () => {
  it('recognizes explicit language families without guessing from text', () => {
    expect(['en', 'eng', 'en-US'].map(languageFamily)).toEqual(['en', 'en', 'en']);
    expect(['zh-CN', 'zh-TW', 'zh-Hant', 'chi', 'zho'].map(languageFamily)).toEqual(['zh', 'zh', 'zh', 'zh', 'zh']);
    expect(languageFamily('und')).toBeNull(); expect(languageFamily(null)).toBeNull();
  });
  it('derives high confidence from two independent agreeing methods and retains provenance', async () => {
    const inputs = [input('sub', 'EMBEDDED_SUBTITLE', [segment('s')]), input('asr', 'ASR', [segment('a', 'HELLO!')])];
    const before = JSON.stringify(inputs); const result = await run(inputs);
    expect(result.segments).toHaveLength(1); expect(result.segments[0]?.confidence).toBeGreaterThanOrEqual(0.85);
    expect(result.segments[0]?.reviewCategory).toBe('HIGH_CONFIDENCE');
    expect(result.segments[0]?.evidence.map(e => e.sourceSegmentId).sort()).toEqual(['a', 's']);
    expect(JSON.stringify(inputs)).toBe(before);
    expect(confidenceReasonsSchema.safeParse(result.segments[0]?.confidenceReasons).success).toBe(true);
    expect(coverageMetricsSchema.safeParse(result.metrics).success).toBe(true);
  });
  it('preserves a meaningful negation conflict and reduces confidence', async () => {
    const result = await run([input('sub', 'EMBEDDED_SUBTITLE', [segment('s', 'I will go')]), input('asr', 'ASR', [segment('a', 'I won’t go')])]);
    expect(['I will go', 'I won’t go']).toContain(result.segments[0]?.text);
    expect(result.segments[0]?.confidence).toBeLessThan(0.85);
    expect(result.segments[0]?.evidence.some(e => e.role === 'CONFLICTING')).toBe(true);
    expect(result.metrics.conflictingSegments).toBe(1);
  });
  it.each(['EMBEDDED_SUBTITLE', 'ASR'] as const)('supports split/merge alignment with a %s long cue', async method => {
    const other = method === 'ASR' ? 'EMBEDDED_SUBTITLE' : 'ASR';
    const result = await run([input('long', method, [segment('long', 'Hello world', 1000, 3000)]), input('split', other, [segment('one', 'Hello', 1000, 1900), segment('two', 'world', 2000, 3000)])]);
    expect(result.segments).toHaveLength(1); expect(result.segments[0]?.evidence).toHaveLength(3);
    expect(result.segments[0]?.confidenceReasons.agreeingMethods).toHaveLength(2);
    expect(['Hello world', 'Hello\nworld']).toContain(result.segments[0]?.text);
  });
  it('allows small OCR sampling jitter without arbitrarily resetting time', async () => {
    const result = await run([input('asr', 'ASR', [segment('a', 'Hello', 1500, 2500)]), input('ocr', 'OCR', [segment('o', 'Hello', 1625, 2625)])]);
    expect(result.segments).toHaveLength(1); expect(result.segments[0]?.startMs).toBeGreaterThanOrEqual(1500);
    expect(result.segments[0]?.confidenceReasons.agreeingMethods).toHaveLength(2);
  });
  it('cannot use Chinese or unknown-language text to vote for English, and counts unrepresented timing', async () => {
    const result = await run([input('asr', 'ASR', [segment('a')]), input('ocr', 'OCR', [segment('z', '你好', 1100, 2100, 'zh-CN'), segment('only', '再見', 3000, 3800, 'zh-TW')]), input('unknown', 'EMBEDDED_SUBTITLE', [segment('u', 'Unlabelled', 1000, 2000, null)])]);
    expect(result.segments).toHaveLength(1); expect(result.segments[0]?.text).toBe('Hello');
    const timing = result.segments[0]?.evidence.filter(e => e.role === 'TIMING_ONLY');
    expect(timing).toHaveLength(2); expect(timing?.every(e => e.textSimilarity === null && e.contributionWeight === null)).toBe(true);
    expect(result.metrics.unrepresentedTimingOnlySegments).toBe(1);
    expect(result.segments[0]?.confidenceReasons.agreeingMethods).toEqual(['ASR']);
  });
  it('fails explicitly when requested Chinese has no Chinese evidence', async () => {
    await expect(run([input('asr', 'ASR', [segment('a')])], 'zh')).rejects.toMatchObject({ code: 'FUSION_LANGUAGE_UNAVAILABLE' });
  });
  it('preserves Chinese scripts and flags their unconverted disagreement', async () => {
    const result = await run([input('sub', 'EMBEDDED_SUBTITLE', [segment('s', '为什么', 1000, 2000, 'zh-CN')]), input('ocr', 'OCR', [segment('o', '為什麼', 1000, 2000, 'zh-TW')])], 'zh');
    expect(['为什么', '為什麼']).toContain(result.segments[0]?.text);
    expect(result.segments[0]?.reviewCategory).not.toBe('HIGH_CONFIDENCE');
    expect(result.segments[0]?.confidenceReasons.messages.join(' ')).toMatch(/script/i);
    expect(result.segments[0]?.evidence).toHaveLength(2);
  });
  it('uses agreeing ASR word bounds, retains 500ms delay and resolves speaker uncertainty', async () => {
    const words = [{ text: 'Hello', startMs: 550, endMs: 1200, confidence: 0.98, speaker: 'SPEAKER_00' }];
    const result = await run([input('sub', 'EMBEDDED_SUBTITLE', [segment('s', 'Hello', 500, 1400, 'en', { speaker: 'SPEAKER_01' })]), input('asr', 'ASR', [segment('a', 'Hello', 500, 1500, 'en', { words, speaker: 'SPEAKER_00' })])]);
    expect(result.segments[0]).toMatchObject({ startMs: 550, endMs: 1200, speaker: null });
    expect(result.segments[0]?.confidenceReasons.speakerUncertain).toBe(true);
  });
  it('keeps ASR-only dialogue with singleton review and union coverage', async () => {
    const result = await run([input('asr', 'ASR', [segment('a', 'Hello', 500, 1500), segment('b', 'World', 2000, 3000)])]);
    expect(result.segments).toHaveLength(2); expect(result.metrics.singleSourceSegments).toBe(2);
    expect(result.metrics.coveredDialogueDurationMs).toBe(2000); expect(result.metrics.coverageRatio).toBe(0.5);
    expect(result.segments.every(s => s.reviewCategory !== 'HIGH_CONFIDENCE')).toBe(true);
  });
  it('two agreeing methods win against one conflict, with lower confidence than unanimity', async () => {
    const inputs = [input('sub', 'EMBEDDED_SUBTITLE', [segment('s', 'Hello')]), input('asr', 'ASR', [segment('a', 'Hello')]), input('ocr', 'OCR', [segment('o', 'Goodbye')])];
    const result = await run(inputs); const unanimous = await run(inputs.map(i => ({ ...i, segments: i.segments.map(s => ({ ...s, text: 'Hello' })) })));
    expect(result.segments[0]?.text).toBe('Hello'); expect(result.segments[0]?.confidence).toBeLessThan(unanimous.segments[0]?.confidence ?? 0);
    expect(result.segments[0]?.evidence.find(e => e.sourceSegmentId === 'o')?.role).toBe('CONFLICTING');
  });
  it('tie breaking and segment output are independent of input ordering', async () => {
    const inputs = [input('z', 'ASR', [segment('z', 'Different')]), input('a', 'EMBEDDED_SUBTITLE', [segment('a', 'Hello')])];
    expect((await run(inputs)).segments).toEqual((await run([...inputs].reverse())).segments);
  });
  it('duplicate reruns of one method cannot inflate confidence or text votes', async () => {
    const initial = [input('asr', 'ASR', [segment('a', 'Hello')]), input('ocr', 'OCR', [segment('o', 'Goodbye')])];
    const result = await run(initial); const duplicated = await run([...initial, ...Array.from({ length: 5 }, (_, n) => input(`repeat${n}`, 'OCR', [segment(`o${n}`, 'Goodbye')]))]);
    expect(duplicated.segments[0]?.text).toBe(result.segments[0]?.text);
    expect(duplicated.segments[0]?.confidence).toBe(result.segments[0]?.confidence);
  });
  it('uses aggregate language evidence, independent method votes and declared tie breaking', () => {
    const inputs = [input('en', 'ASR', [segment('en', 'Hello')]), input('zh', 'OCR', [segment('zh', '你好', 1000, 2000, 'zh')])];
    expect(recommendLanguage(inputs, 'zh-TW').language).toBe('zh');
    expect(recommendLanguage(inputs, null)).toEqual(recommendLanguage([...inputs].reverse(), null));
    const longer = input('long', 'ASR', [segment('long', '你好', 0, 3000, 'zh')]);
    expect(recommendLanguage([input('tiny', 'ASR', [segment('tiny')]), longer], 'en').language).toBe('zh');
  });
  it('never treats an untested long-text tail as agreement', async () => {
    const prefix = 'hello '.repeat(400);
    const result = await run([input('s', 'EMBEDDED_SUBTITLE', [segment('s', `${prefix}will go`)]), input('a', 'ASR', [segment('a', `${prefix}won’t go`)])]);
    expect(result.segments[0]?.reviewCategory).not.toBe('HIGH_CONFIDENCE');
    expect(result.segments[0]?.confidenceReasons.messages.join(' ')).toMatch(/bounded|truncat/i);
  });
  it('bounds temporal groups, consumes evidence once and checks cancellation during CPU stages', async () => {
    const inputs = ['EMBEDDED_SUBTITLE', 'ASR', 'OCR'].map((method, m) => input(`run${m}`, method as FusionInput['method'], Array.from({ length: 1200 }, (_, n) => segment(`${m}-${n}`, `Line ${n}`, n * 2500, n * 2500 + 1800))));
    const labels: string[] = []; let checks = 0;
    const result = await fuseTranscript(inputs, settings, 'en', 3600000, { stage: async label => { labels.push(label); }, check: () => { checks++; } });
    expect(result.segments).toHaveLength(1200);
    const ids = result.segments.flatMap(s => s.evidence.map(e => e.sourceSegmentId));
    expect(new Set(ids).size).toBe(ids.length); expect(ids).toHaveLength(3600);
    expect(labels).toContain('alignment'); expect(labels).toContain('reconciliation'); expect(checks).toBeGreaterThan(10);
    await expect(fuseTranscript(inputs, settings, 'en', null, { check: () => { throw new Error('cancelled'); } })).rejects.toThrow('cancelled');
  });
  it('rejects malformed or excessive evidence at its external boundary', async () => {
    await expect(run([input('a', 'ASR', [segment('bad', 'Hello', 2000, 1000)])])).rejects.toMatchObject({ code: 'FUSION_INVALID_INPUT' });
    await expect(run([input('a', 'ASR', Array.from({ length: 50001 }, (_, n) => segment(`s${n}`)))])).rejects.toMatchObject({ code: 'FUSION_INVALID_INPUT' });
  });
  it('does not consume the next consecutive cue as extra split evidence', async () => {
    const cues = [segment('one', 'Hello', 1000, 1800), segment('two', 'World', 1900, 2700)];
    const result = await run([input('sub', 'EMBEDDED_SUBTITLE', cues), input('asr', 'ASR', cues.map(s => ({ ...s, id: `a-${s.id}` }))) ]);
    expect(result.segments).toHaveLength(2);
    expect(result.segments.every(s => s.evidence.length === 2 && s.reviewCategory === 'HIGH_CONFIDENCE')).toBe(true);
  });
  it('applies runtime defaults without dropping original source text', async () => {
    const source = input('asr', 'ASR', [segment('a', '  Hello  ')]);
    delete (source.segments[0] as Partial<FusionEvidence>).words;
    const result = await run([source]); expect(result.segments[0]?.text).toBe('  Hello  ');
  });
  it('runtime-validates automatic language recommendation too', () => {
    expect(() => recommendLanguage([input('a', 'ASR', [segment('a', 'Hello', 2000, 1000)])], null)).toThrowError(expect.objectContaining({ code: 'FUSION_INVALID_INPUT' }));
  });
  it('does not merge consecutive repeated text when each method has a matching overlapping cue', async () => {
    const cues = [segment('one', 'Hello', 1000, 1800), segment('two', 'Hello', 1900, 2700)];
    const result = await run([input('sub', 'EMBEDDED_SUBTITLE', cues), input('asr', 'ASR', cues.map(s => ({ ...s, id: `a-${s.id}` }))) ]);
    expect(result.segments).toHaveLength(2); expect(result.segments.every(s => s.evidence.length === 2 && s.reviewCategory === 'HIGH_CONFIDENCE')).toBe(true);
  });
  it('does not crop full text to only partially aligned ASR word bounds', async () => {
    const words = [{ text: 'Hello', startMs: 550, endMs: 1000, confidence: 0.9, speaker: null }, { text: 'world', startMs: null, endMs: null, confidence: null, speaker: null }];
    const result = await run([input('asr', 'ASR', [segment('a', 'Hello world', 500, 2000, 'en', { words })])]);
    expect(result.segments[0]).toMatchObject({ startMs: 500, endMs: 2000 });
    expect(result.segments[0]?.confidenceReasons.messages.join(' ')).toMatch(/partial/i);
  });
  it('retains a split ASR cue with no word alignment when another cue has timed words', async () => {
    const words = [{ text: 'Hello', startMs: 550, endMs: 900, confidence: 0.9, speaker: null }];
    const result = await run([input('sub', 'EMBEDDED_SUBTITLE', [segment('s', 'Hello world', 500, 2000)]), input('asr', 'ASR', [segment('a', 'Hello', 500, 1000, 'en', { words }), segment('b', 'world', 1100, 2000)])]);
    expect(result.segments[0]).toMatchObject({ startMs: 500, endMs: 2000 });
  });
  it('does not refine full ASR text to a known but incomplete word list', async () => {
    const words = [{ text: 'Hello', startMs: 550, endMs: 1000, confidence: 0.9, speaker: null }];
    const result = await run([input('asr', 'ASR', [segment('a', 'Hello world', 500, 2000, 'en', { words })])]);
    expect(result.segments[0]).toMatchObject({ startMs: 500, endMs: 2000 });
    expect(result.segments[0]?.confidenceReasons.messages.join(' ')).toMatch(/incomplete/i);
  });
  it('never derives a zero-duration transcript from a zero-duration timed word', async () => {
    const words = [{ text: 'Hello', startMs: 550, endMs: 550, confidence: 0.9, speaker: null }];
    const result = await run([input('asr', 'ASR', [segment('a', 'Hello', 500, 2000, 'en', { words })])]);
    expect(result.segments[0]).toMatchObject({ startMs: 500, endMs: 2000 });
    expect(result.segments[0]?.confidenceReasons.messages.join(' ')).toMatch(/positive duration/i);
  });
  it('does not use narrower ASR word timing when the chosen fuzzy-agreeing text includes an extra word', async () => {
    const asrText = 'We will preserve all of the original media and source evidence';
    const words = asrText.split(' ').map((text, n, list) => ({ text, startMs: 1100 + Math.floor(n * 1400 / list.length), endMs: 1100 + Math.floor((n + 1) * 1400 / list.length), confidence: 0.9, speaker: null }));
    const result = await fuseTranscript([input('sub', 'EMBEDDED_SUBTITLE', [segment('s', `${asrText} today`, 1000, 4000)]), input('asr', 'ASR', [segment('a', asrText, 1100, 3000, 'en', { words })])], settings, 'en', 5000);
    expect(result.segments[0]).toMatchObject({ text: `${asrText} today`, startMs: 1050, endMs: 3500 });
    expect(result.segments[0]?.confidenceReasons.messages.join(' ')).toMatch(/canonical text/i);
    expect(result.segments[0]?.reviewCategory).not.toBe('HIGH_CONFIDENCE');
    expect(result.segments[0]?.confidenceReasons.messages.join(' ')).toMatch(/approximate similarity/i);
  });
  it('classifies independent simple agreement as high confidence without inventing missing provider confidence', async () => {
    const inputs = [input('sub', 'EMBEDDED_SUBTITLE', [segment('s', 'Hello', 10000, 12000, 'en', { confidence: null })]), input('asr', 'ASR', [segment('a', 'Hello', 10100, 11900, 'en', { confidence: null })])];
    const result = await fuseTranscript(inputs, settings, 'en', 20000);
    expect(result.segments[0]?.reviewCategory).toBe('HIGH_CONFIDENCE');
    expect(result.segments[0]?.confidenceReasons.providerConfidenceMissing).toBe(true);
    expect(result.segments[0]?.confidenceReasons.messages.join(' ')).toMatch(/not calibrated/i);
    expect(inputs.every(i => i.segments[0]?.confidence === null)).toBe(true);
  });
  it('bounds dense windows and prevents transitive long chains without losing same-language evidence', async () => {
    const source = Array.from({ length: 6000 }, (_, n) => segment(`dense-${n}`, 'Hello', 1000, 2000));
    const result = await run([input('dense', 'ASR', source)]);
    const links = result.segments.flatMap(s => s.evidence.map(e => e.sourceSegmentId));
    expect(new Set(links).size).toBe(6000); expect(links).toHaveLength(6000);
    expect(result.segments.every(s => s.evidence.length <= settings.temporal.maximumSegmentsPerRun)).toBe(true);
    const chain = Array.from({ length: 100 }, (_, n) => input(`r${n % 3}`, (['ASR', 'OCR', 'EMBEDDED_SUBTITLE'] as const)[n % 3]!, [segment(`chain${n}`, 'Hello', n * 1000, n * 1000 + 1900)]));
    const merged = [...new Set(chain.map(i => i.id))].map(id => input(id, chain.find(i => i.id === id)!.method, chain.filter(i => i.id === id).flatMap(i => i.segments)));
    const chained = await run(merged);
    expect(chained.segments.every(s => s.endMs - s.startMs <= settings.temporal.maximumClusterSpanMs)).toBe(true);
  });
});
