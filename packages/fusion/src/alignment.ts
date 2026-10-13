import { setImmediate } from 'node:timers/promises';
import { languageFamily } from './language';
import { compareText } from './text';
import type { FusionEvidence, FusionInput, FusionSettings, FusionHooks, Language, Method } from './types';
export interface AlignedEvidence extends FusionEvidence { method: Method; family: Language | null }
export interface AlignmentGroup { reference: AlignedEvidence; evidence: AlignedEvidence[]; bounded: boolean }
export function orderEvidence(a: AlignedEvidence, b: AlignedEvidence): number { return a.startMs - b.startMs || a.endMs - b.endMs || a.extractionRunId.localeCompare(b.extractionRunId, 'en') || a.sequence - b.sequence || a.id.localeCompare(b.id, 'en'); }
export function temporalScore(a: { startMs: number; endMs: number }, b: { startMs: number; endMs: number }): { iou: number; containment: number; gap: number; center: number } {
  const overlap = Math.max(0, Math.min(a.endMs, b.endMs) - Math.max(a.startMs, b.startMs));
  return { iou: overlap / (Math.max(a.endMs, b.endMs) - Math.min(a.startMs, b.startMs)), containment: overlap / Math.min(a.endMs - a.startMs, b.endMs - b.startMs), gap: Math.max(0, Math.max(a.startMs, b.startMs) - Math.min(a.endMs, b.endMs)), center: Math.abs(a.startMs + a.endMs - b.startMs - b.endMs) / 2 };
}
function eligible(a: AlignedEvidence, b: AlignedEvidence, settings: FusionSettings): boolean {
  const t = temporalScore(a, b); const limits = settings.temporal;
  if (t.center > limits.maximumCenterDistanceMs) return false;
  return t.iou >= limits.minimumIou || t.containment >= limits.minimumContainment || (t.iou === 0 && t.gap <= limits.maximumGapMs && a.family !== null && a.family === b.family && compareText(a.text, b.text, a.family, settings).similarity >= settings.text.agreementThreshold);
}
function lowerBound(items: AlignedEvidence[], start: number): number { let low = 0; let high = items.length; while (low < high) { const mid = (low + high) >>> 1; if (items[mid]!.startMs < start) low = mid + 1; else high = mid; } return low; }
export async function align(inputs: FusionInput[], settings: FusionSettings, language: Language, hooks: FusionHooks): Promise<{ groups: AlignmentGroup[]; unrepresented: number }> {
  const all = inputs.flatMap(input => input.segments.map(s => ({ ...s, method: input.method, family: languageFamily(s.language) }))).sort(orderEvidence);
  const used = new Set<string>(); const groups: AlignmentGroup[] = [];
  const limits = settings.temporal;
  for (let n = 0; n < all.length; n++) {
    if (n % 100 === 0) { await setImmediate(); hooks.check?.(); }
    const seed = all[n]!;
    if (seed.family !== language || used.has(seed.id)) continue;
    // A fixed window and reference, never recursive graph/transitive closure.
    const temporalLower = lowerBound(all, Math.max(0, seed.startMs - limits.maximumClusterSpanMs));
    const lower = Math.max(temporalLower, n - limits.maximumCandidatesPerWindow);
    const maximumIndex = Math.min(all.length, n + limits.maximumCandidatesPerWindow + 1);
    const upperStart = seed.endMs + limits.maximumGapMs;
    const nearby: AlignedEvidence[] = []; let bounded = lower > temporalLower || (maximumIndex < all.length && all[maximumIndex]!.startMs <= upperStart);
    for (let k = lower; k < maximumIndex && all[k]!.startMs <= upperStart; k++) {
      const candidate = all[k]!;
      if (used.has(candidate.id) || !eligible(seed, candidate, settings)) continue;
      if (nearby.length >= limits.maximumCandidatesPerWindow) { bounded = true; break; }
      nearby.push(candidate);
    }
    if (!nearby.some(s => s.id === seed.id)) nearby.push(seed);
    const reference = nearby.filter(s => s.family === language && s.endMs - s.startMs <= limits.maximumClusterSpanMs && (s.id === seed.id || s.extractionRunId !== seed.extractionRunId)).sort((a, b) => (b.endMs - b.startMs) - (a.endMs - a.startMs) || orderEvidence(a, b))[0] ?? seed;
    // Include split cues after the seed's end using the same fixed reference.
    const end = reference.endMs + limits.maximumGapMs;
    const candidates = new Map<string, AlignedEvidence>(); candidates.set(seed.id, seed); candidates.set(reference.id, reference);
    const referenceLower = lowerBound(all, Math.max(0, reference.startMs - limits.maximumClusterSpanMs));
    if (referenceLower < n - limits.maximumCandidatesPerWindow || (maximumIndex < all.length && all[maximumIndex]!.startMs <= end)) bounded = true;
    for (let k = Math.max(referenceLower, n - limits.maximumCandidatesPerWindow); k < maximumIndex && all[k]!.startMs <= end; k++) {
      const candidate = all[k]!;
      if (used.has(candidate.id) || !eligible(reference, candidate, settings)) continue;
      if (candidates.size >= limits.maximumCandidatesPerWindow && !candidates.has(candidate.id)) { bounded = true; break; }
      // Original unusually long singleton survives, but cannot expand a group.
      if (Math.max(reference.endMs, candidate.endMs) - Math.min(reference.startMs, candidate.startMs) > limits.maximumClusterSpanMs && candidate.id !== seed.id) { bounded = true; continue; }
      candidates.set(candidate.id, candidate);
    }
    const counts = new Map<string, number>(); const evidence: AlignedEvidence[] = [];
    const overlappingRuns = new Set([...candidates.values()].filter(s => temporalScore(reference, s).iou > 0).map(s => s.extractionRunId));
    for (const candidate of [...candidates.values()].sort((a, b) => (a.id === seed.id ? -1 : b.id === seed.id ? 1 : orderEvidence(a, b)))) {
      const count = counts.get(candidate.extractionRunId) ?? 0;
      if (count >= limits.maximumSegmentsPerRun) { bounded = true; continue; }
      if (candidate.id !== seed.id && temporalScore(reference, candidate).iou === 0 && (overlappingRuns.has(candidate.extractionRunId) || count > 0)) continue;
      // Adjacent cues of the reference's own run are not split candidates.
      if (candidate.extractionRunId === reference.extractionRunId && candidate.id !== reference.id && candidate.id !== seed.id) continue;
      counts.set(candidate.extractionRunId, count + 1); evidence.push(candidate); used.add(candidate.id);
    }
    groups.push({ reference, evidence: evidence.sort(orderEvidence), bounded });
  }
  return { groups, unrepresented: all.filter(s => s.family !== language && !used.has(s.id)).length };
}
