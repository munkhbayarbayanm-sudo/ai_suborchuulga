import type { FusionSettings, Language } from './types';
export interface Comparison { similarity: number; bounded: boolean; negationConflict: boolean }
export function normalizedText(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/[.,!?;:，。！？；：、…“”"'’‘「」『』()[\]{}<>\-—–]/gu, '').replace(/\s+/gu, '');
}
function negative(text: string): boolean { return /\b(?:not|never|no|cannot|won't|can't|\w+n't)\b/u.test(text.normalize('NFKC').toLowerCase().replaceAll('’', "'")); }
export function compareText(a: string, b: string, language: Language, settings: FusionSettings): Comparison {
  const limit = settings.text.maximumComparisonCharacters;
  const bounded = a.length > limit || b.length > limit;
  const negationConflict = language === 'en' && negative(a) !== negative(b);
  const x = normalizedText(a.slice(0, limit)); const y = normalizedText(b.slice(0, limit));
  let similarity = 0;
  if (x === y) similarity = 1;
  else if (x.length && y.length) {
    const counts = new Map<string, number>();
    for (let n = 0; n < x.length - 1; n++) { const key = x.slice(n, n + 2); counts.set(key, (counts.get(key) ?? 0) + 1); }
    let common = 0;
    for (let n = 0; n < y.length - 1; n++) { const key = y.slice(n, n + 2); const remaining = counts.get(key) ?? 0; if (remaining) { common++; counts.set(key, remaining - 1); } }
    similarity = 2 * common / Math.max(1, x.length + y.length - 2);
  }
  if (negationConflict) similarity = Math.min(similarity, Math.max(0, settings.text.conflictThreshold - 0.01));
  if (bounded) similarity = Math.min(similarity, Math.max(0, settings.text.agreementThreshold - 0.01));
  return { similarity, bounded, negationConflict };
}
