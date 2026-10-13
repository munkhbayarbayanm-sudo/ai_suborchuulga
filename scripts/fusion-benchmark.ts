import { fusionSettingsSchema } from '../packages/contracts/src/index';
import { fuseTranscript, type FusionInput } from '../packages/fusion/src/index';
import { performance } from 'node:perf_hooks';

// Legal deterministic in-memory evidence. No media, provider, database or queue claims.
const settings = fusionSettingsSchema.parse({});
for (const [episodeMinutes, perMethod] of [[45, 500], [60, 1200]] as const) {
  const durationMs = episodeMinutes * 60000;
  const spacing = durationMs / perMethod;
  const inputs: FusionInput[] = (['EMBEDDED_SUBTITLE', 'ASR', 'OCR'] as const).map((method, m) => ({
    id: `benchmark-${method}`,
    method,
    segments: Array.from({ length: perMethod }, (_, n) => {
      const startMs = Math.round(n * spacing + 500);
      const endMs = Math.round(n * spacing + Math.min(1800, spacing - 500));
      const jitter = m === 2 ? 125 : 0;
      return { id: `${method}-${n}`, extractionRunId: `benchmark-${method}`, sequence: n, startMs: startMs + jitter, endMs: endMs + jitter, text: `Deterministic dialogue line ${n}.`, language: 'en', confidence: m === 2 ? 0.88 : 0.95, speaker: null, words: [] };
    })
  }));
  // One warm-up then three measured repetitions; timings include cooperative yields.
  await fuseTranscript(inputs, settings, 'en', durationMs);
  const measurements = [];
  for (let iteration = 0; iteration < 3; iteration++) {
    const started = performance.now(); const result = await fuseTranscript(inputs, settings, 'en', durationMs);
    if (result.segments.length !== perMethod || result.segments.some(s => s.evidence.length !== 3)) throw new Error('Benchmark evidence was not fully represented.');
    measurements.push({ totalMs: +(performance.now() - started).toFixed(2), alignmentMs: +result.timings.alignmentMs.toFixed(2), reconciliationMs: +result.timings.reconciliationMs.toFixed(2), canonicalCount: result.segments.length, sourceCount: result.metrics.inputSegmentCount });
  }
  process.stdout.write(`${JSON.stringify({ episodeMinutes, perMethod, measurements })}\n`);
}
