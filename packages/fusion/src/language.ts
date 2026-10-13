import { AppError } from '@mongolsub/domain';
import type { FusionInput, Language, Method } from './types';
import { validateInputs } from './validation';
export function languageFamily(language: string | null): Language | null {
  const tag = language?.trim().toLowerCase().replaceAll('_', '-');
  if (tag === 'eng' || tag === 'en' || tag?.startsWith('en-')) return 'en';
  if (tag === 'chi' || tag === 'zho' || tag === 'zh' || tag?.startsWith('zh-')) return 'zh';
  return null;
}
export function unionDuration(intervals: { startMs: number; endMs: number }[], durationMs: number | null = null): number {
  const ordered = intervals.map(s => ({ startMs: s.startMs, endMs: durationMs === null ? s.endMs : Math.min(s.endMs, durationMs) })).filter(s => s.endMs > s.startMs).sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  let total = 0; let end = 0;
  for (const s of ordered) { total += Math.max(0, s.endMs - Math.max(end, s.startMs)); end = Math.max(end, s.endMs); }
  return total;
}
export function recommendLanguage(inputs: FusionInput[], declaredLanguage: string | null): { language: Language; reason: string; scores: { en: number; zh: number } } {
  inputs = validateInputs(inputs);
  const summaries = { en: new Map<Method, { duration: number; count: number; quality: number }>(), zh: new Map<Method, { duration: number; count: number; quality: number }>() };
  for (const input of inputs) for (const language of ['en', 'zh'] as const) {
    const segments = input.segments.filter(s => languageFamily(s.language) === language);
    if (!segments.length) continue;
    const next = { duration: unionDuration(segments), count: segments.length, quality: segments.reduce((n, s) => n + (s.confidence ?? 0.5), 0) / segments.length };
    const existing = summaries[language].get(input.method);
    // A rerun cannot provide an extra independent-method vote.
    if (!existing || next.duration > existing.duration || (next.duration === existing.duration && (next.count > existing.count || (next.count === existing.count && next.quality > existing.quality)))) summaries[language].set(input.method, next);
  }
  const stats = (language: Language) => [...summaries[language].values()].reduce((a, s) => ({ duration: a.duration + s.duration, count: a.count + s.count, quality: a.quality + s.quality }), { duration: 0, count: 0, quality: 0 });
  const en = stats('en'); const zh = stats('zh');
  if (!en.count && !zh.count) throw new AppError('FUSION_LANGUAGE_UNAVAILABLE', 'Selected sources have no English or Chinese language evidence.');
  const score = (language: Language, value: typeof en) => !value.count ? 0 : 0.55 * value.duration / Math.max(en.duration, zh.duration, 1) + 0.2 * value.count / Math.max(en.count, zh.count, 1) + 0.15 * value.quality / Math.max(en.quality, zh.quality, 1) + 0.1 * summaries[language].size / Math.max(summaries.en.size, summaries.zh.size, 1);
  const scores = { en: score('en', en), zh: score('zh', zh) };
  const declared = languageFamily(declaredLanguage);
  const tie = Math.abs(scores.en - scores.zh) < 1e-9;
  const language: Language = tie ? declared ?? 'en' : scores.en > scores.zh ? 'en' : 'zh';
  return { language, scores, reason: `Aggregate language evidence: coverage 55%, segment count 20%, provider confidence 15%, independent method richness 10%. en=${scores.en.toFixed(4)}, zh=${scores.zh.toFixed(4)}.${tie ? ` Tie resolved by ${declared ? 'declared source language' : 'stable English fallback'}.` : ''}` };
}
