import { setImmediate } from 'node:timers/promises';
import { temporalScore, type AlignedEvidence, type AlignmentGroup } from './alignment';
import { compareText, normalizedText, type Comparison } from './text';
import type { DerivedSegment, FusionHooks, FusionSettings, Language, Method } from './types';
interface Candidate { runId: string; method: Method; segments: AlignedEvidence[]; text: string; startMs: number; endMs: number; quality: number }
const methodOrder: Method[] = ['EMBEDDED_SUBTITLE', 'ASR', 'OCR'];
const round = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 1000000) / 1000000;
function median(values: number[]): number { const sorted = [...values].sort((a, b) => a - b); const n = sorted.length; return n % 2 ? sorted[n >> 1]! : Math.round((sorted[(n >> 1) - 1]! + sorted[n >> 1]!) / 2); }
function compareCandidate(a: Candidate, b: Candidate): number { return methodOrder.indexOf(a.method) - methodOrder.indexOf(b.method) || a.runId.localeCompare(b.runId, 'en'); }
function reconcileGroup(group: AlignmentGroup, settings: FusionSettings, language: Language): DerivedSegment {
  const runSegments = new Map<string, AlignedEvidence[]>();
  for (const s of group.evidence) if (s.family === language) { const items = runSegments.get(s.extractionRunId) ?? []; items.push(s); runSegments.set(s.extractionRunId, items); }
  const candidates: Candidate[] = [...runSegments].map(([runId, segments]) => ({ runId, method: segments[0]!.method, segments, text: segments.map(s => s.text).join('\n'), startMs: Math.min(...segments.map(s => s.startMs)), endMs: Math.max(...segments.map(s => s.endMs)), quality: settings.reliability[segments[0]!.method] * (0.5 + 0.5 * segments.reduce((n, s) => n + (s.confidence ?? 0.5), 0) / segments.length) })).sort(compareCandidate);
  const comparisons = new Map<string, Comparison>();
  const comparison = (a: Candidate, b: Candidate): Comparison => { const key = JSON.stringify([a.runId, b.runId]); let value = comparisons.get(key); if (!value) { value = compareText(a.text, b.text, language, settings); comparisons.set(key, value); } return value; };
  const supporters = (candidate: Candidate) => candidates.filter(other => other.runId === candidate.runId || comparison(candidate, other).similarity >= settings.text.agreementThreshold);
  const votes = (candidate: Candidate) => { const perMethod = new Map<Method, number>(); for (const other of supporters(candidate)) perMethod.set(other.method, Math.max(perMethod.get(other.method) ?? 0, other.quality)); return [...perMethod.values()].reduce((a, b) => a + b, 0); };
  const winner = [...candidates].sort((a, b) => votes(b) - votes(a) || b.quality - a.quality || compareCandidate(a, b))[0]!;
  const agreed = supporters(winner);
  const approximateAgreement = agreed.some(c => normalizedText(c.text) !== normalizedText(winner.text));
  const disagree = candidates.filter(c => !agreed.includes(c));
  const conflicting = disagree.filter(c => comparison(winner, c).similarity < settings.text.conflictThreshold || comparison(winner, c).negationConflict);
  const agreeingMethods = methodOrder.filter(method => agreed.some(c => c.method === method));
  const conflictingMethods = methodOrder.filter(method => conflicting.some(c => c.method === method));
  // One representative per method controls timing and score too, preventing rerun multiplication.
  const eligibleTiming = agreeingMethods.map(method => agreed.filter(c => c.method === method).sort((a, b) => b.quality - a.quality || compareCandidate(a, b))[0]!);
  const asr = eligibleTiming.find(c => c.method === 'ASR');
  const asrWords = asr?.segments.flatMap(s => s.words) ?? [];
  const partialWordTiming = asrWords.some(w => w.startMs === null || w.endMs === null) || (asrWords.length > 0 && !!asr?.segments.some(s => !s.words.length));
  const incompleteWordText = asrWords.length > 0 && normalizedText(asrWords.map(w => w.text).join(' ')) !== normalizedText(asr!.text);
  const incompleteCanonicalWordText = asrWords.length > 0 && normalizedText(asrWords.map(w => w.text).join(' ')) !== normalizedText(winner.text);
  const wordStartMs = !partialWordTiming && asrWords.length ? Math.min(...asrWords.map(w => w.startMs!)) : null;
  const wordEndMs = !partialWordTiming && asrWords.length ? Math.max(...asrWords.map(w => w.endMs!)) : null;
  const invalidWordDuration = wordStartMs !== null && wordEndMs !== null && wordEndMs <= wordStartMs;
  const timedWords = partialWordTiming || incompleteWordText || incompleteCanonicalWordText || invalidWordDuration ? [] : asrWords;
  const startMs = timedWords.length ? Math.min(...timedWords.map(w => w.startMs!)) : median(eligibleTiming.map(c => c.startMs));
  const endMs = timedWords.length ? Math.max(...timedWords.map(w => w.endMs!)) : median(eligibleTiming.map(c => c.endMs));
  const starts = eligibleTiming.map(c => c.startMs); const ends = eligibleTiming.map(c => c.endMs);
  const timingSpreadMs = Math.max(Math.max(...starts) - Math.min(...starts), Math.max(...ends) - Math.min(...ends));
  const labels = new Set(agreed.flatMap(c => c.segments.flatMap(s => [s.speaker, ...s.words.map(w => w.speaker)]).filter((s): s is string => s !== null)));
  const speakerUncertain = labels.size > 1;
  const bounded = group.bounded || disagree.some(c => comparison(winner, c).bounded) || winner.text.length > settings.text.maximumComparisonCharacters;
  const baseQuality = winner.quality;
  const agreementBonus = agreeingMethods.length > 1 ? Math.min(0.36, 0.3 + (agreeingMethods.length - 2) * 0.18) : 0;
  const conflictPenalty = Math.min(0.44, conflictingMethods.length * 0.22 + (disagree.length && !conflicting.length ? 0.08 : 0));
  const timingPenalty = timingSpreadMs > settings.review.timingDisagreementMs ? Math.min(0.2, (timingSpreadMs - settings.review.timingDisagreementMs) / 5000) : 0;
  const segmentationPenalty = Math.min(0.12, (Math.max(...candidates.map(c => c.segments.length)) - 1) * 0.02) + (bounded ? 0.08 : 0);
  const confidence = round(Math.min(agreeingMethods.length === 1 || bounded || disagree.length || approximateAgreement ? settings.review.highThreshold - 0.01 : 1, baseQuality + agreementBonus - conflictPenalty - timingPenalty - segmentationPenalty));
  const messages: string[] = [];
  if (agreeingMethods.length === 1) messages.push('Only one independent method supports this text; source confidence is a provisional heuristic.');
  else messages.push(`${agreeingMethods.length} independent extraction methods ${approximateAgreement ? 'support this candidate under the approximate similarity rule' : 'agree on normalized text'}.`);
  if (approximateAgreement) messages.push('Text differs despite approximate similarity; review alternatives.');
  if (conflicting.length) messages.push('Meaningful text conflicts remain preserved as alternative evidence.');
  else if (disagree.length) messages.push('Text similarity is inconclusive; alternatives require review.');
  if (disagree.some(c => comparison(winner, c).negationConflict)) messages.push('English negation differs; lexical resemblance cannot establish semantic agreement.');
  if (language === 'zh' && disagree.length) messages.push('Chinese script conversion is unavailable in fusion-v1; Simplified and Traditional differences may appear as conflicts.');
  if (bounded) messages.push('Bounded comparison or alignment limit reached; untested tails or candidates cannot establish high confidence.');
  if (timedWords.length) messages.push('Canonical timing uses observed word bounds from an agreeing ASR source, preserving the original media time base.');
  else messages.push('Canonical timing uses median boundaries of one agreeing source per independent method.');
  if (partialWordTiming) messages.push('Partial ASR word alignment remains source evidence; full-text timing uses segment boundaries.');
  if (incompleteWordText) messages.push('ASR word text is incomplete or differs from the full candidate; timing uses full segment boundaries.');
  if (incompleteCanonicalWordText) messages.push('ASR words do not cover the complete chosen canonical text; timing uses full segment boundaries.');
  if (invalidWordDuration) messages.push('ASR word bounds lack positive duration; timing uses full segment boundaries.');
  if (timingPenalty) messages.push('Supporting source timing exceeds the configured disagreement tolerance.');
  if (speakerUncertain) messages.push('Speaker labels disagree; no identity was inferred.');
  const cross = group.evidence.filter(s => s.family !== language);
  if (cross.length) messages.push('Cross-language and unknown-language evidence is timing-only and contributes no text vote.');
  if (candidates.some(c => c.segments.some(s => s.confidence === null))) messages.push('Provider confidence is missing; the agreement score is a provisional heuristic, not calibrated correctness.');
  const reviewCategory = confidence >= settings.review.highThreshold ? 'HIGH_CONFIDENCE' : confidence < settings.review.problemThreshold ? 'LIKELY_PROBLEM' : 'REVIEW_RECOMMENDED';
  return {
    startMs, endMs, text: winner.text, language, speaker: speakerUncertain ? null : [...labels][0] ?? null, confidence, reviewCategory, derivationType: group.evidence.length === 1 && winner.segments.length === 1 ? 'DIRECT' : 'RECONCILED',
    confidenceReasons: { messages, agreeingMethods, conflictingSources: conflicting.length, singleSource: agreeingMethods.length === 1, timingSpreadMs, segmentationSizes: candidates.map(c => c.segments.length), speakerUncertain, providerConfidenceMissing: candidates.some(c => c.segments.some(s => s.confidence === null)), scoreFactors: { baseQuality: round(baseQuality), agreementBonus: round(agreementBonus), conflictPenalty: round(conflictPenalty), timingPenalty: round(timingPenalty), segmentationPenalty: round(segmentationPenalty), crossLanguageBonus: 0 } },
    evidence: group.evidence.map(s => {
      const t = temporalScore(group.reference, s); const candidate = candidates.find(c => c.runId === s.extractionRunId && s.family === language);
      const similarity = candidate ? candidate.runId === winner.runId ? 1 : comparison(winner, candidate).similarity : null;
      return { sourceSegmentId: s.id, sourceExtractionRunId: s.extractionRunId, role: !candidate ? 'TIMING_ONLY' : candidate.runId === winner.runId ? 'PRIMARY' : agreed.includes(candidate) ? 'SUPPORTING' : 'CONFLICTING', alignmentScore: round(Math.max(t.iou, t.containment)), textSimilarity: similarity === null ? null : round(similarity), temporalOverlap: round(t.iou), contributionWeight: candidate ? round(candidate.quality) : null };
    })
  };
}
export async function reconcile(groups: AlignmentGroup[], settings: FusionSettings, language: Language, hooks: FusionHooks): Promise<DerivedSegment[]> {
  const segments: DerivedSegment[] = [];
  for (let n = 0; n < groups.length; n++) { if (n % 100 === 0) { await setImmediate(); hooks.check?.(); } segments.push(reconcileGroup(groups[n]!, settings, language)); }
  return segments.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs || a.evidence[0]!.sourceSegmentId.localeCompare(b.evidence[0]!.sourceSegmentId, 'en'));
}
