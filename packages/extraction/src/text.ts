import { createHash } from 'node:crypto';
import { AppError } from '@mongolsub/domain';
import { segmentEvidenceSchema, type RunSettings, type SegmentEvidence } from '@mongolsub/contracts';
export function normalizedLanguage(value: string | null): string | null {
  const tag = value?.toLowerCase();
  if (tag === 'eng' || tag === 'en') return 'en';
  if (['zh-tw','zh-hant','zht'].includes(tag ?? '')) return 'zh-TW';
  if (['zh-cn','zh-hans'].includes(tag ?? '')) return 'zh-CN';
  if (['zh','chi','zho','cmn'].includes(tag ?? '')) return 'zh';
  return tag && /^[a-z]{2,3}(?:-[a-z0-9]+)*$/.test(tag) && !['und','mul'].includes(tag) ? value : null;
}
export function extractionIdentity(assetId: string, settings: RunSettings, provider: string, version: string | null, model: string | null, revision: string): string {
  const ordered = Object.fromEntries(Object.entries(settings).sort(([a], [b]) => a.localeCompare(b)));
  return createHash('sha256').update(JSON.stringify({ assetId, settings: ordered, provider, version, model, revision })).digest('hex');
}
function timestamp(value: string): number {
  const match = /^(\d{1,3}):([0-5]\d):([0-5]\d)[,.](\d{3})$/.exec(value);
  if (!match) throw new AppError('INVALID_SUBTITLE_TIMING', 'A subtitle cue has malformed timestamps.');
  return ((Number(match[1]) * 60 + Number(match[2])) * 60 + Number(match[3])) * 1000 + Number(match[4]);
}
function cleanText(text: string): string {
  const stripped = text.replace(/\{\\[^}]*\}/g, '').replace(/<\/?(?:i|b|u|font|ruby|rt|c|v|lang)(?:\.[^>\s]+|\s[^>]*)?>/gi, '').replace(/\\[Nn]/g, '\n').replace(/\\h/g, ' ');
  return stripped.replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_all, entity: string) => ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}[entity] ?? _all)).trim();
}
export function parseSubtitles(input: string, language: string | null): SegmentEvidence[] {
  const result: SegmentEvidence[] = [];
  for (const block of input.replace(/^\ufeff/, '').replace(/\r\n?/g, '\n').trim().split(/\n{2,}/)) {
    if (!block.trim()) continue;
    const lines = block.split('\n');
    const timingIndex = lines.findIndex(line => line.includes('-->'));
    if (timingIndex < 0) throw new AppError('INVALID_SUBTITLE_FORMAT', 'An extracted subtitle cue has no timing line.');
    const parts = lines[timingIndex]?.split(/\s*-->\s*/);
    if (!parts?.[0] || !parts[1]) throw new AppError('INVALID_SUBTITLE_TIMING', 'A subtitle cue has malformed timestamps.');
    const startMs = timestamp(parts[0].trim()); const endMs = timestamp(parts[1].trim().split(/\s/)[0] ?? '');
    const text = cleanText(lines.slice(timingIndex + 1).join('\n'));
    // Pure rendering/drawing cues do not produce dialogue. Malformed timed text fails.
    if (!text) continue;
    const parsed = segmentEvidenceSchema.safeParse({ startMs, endMs, text, language, confidence: null, speaker: null, words: [] });
    if (!parsed.success) throw new AppError('INVALID_SUBTITLE_TIMING', 'An extracted subtitle cue has invalid timing or text.');
    result.push(parsed.data);
  }
  return result.sort((a,b) => a.startMs - b.startMs);
}
