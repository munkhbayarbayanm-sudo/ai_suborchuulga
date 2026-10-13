import { asrRequestSchema, embeddedRequestSchema, extractionRunSchema, ocrRequestSchema, type ExtractionRunDto } from '@mongolsub/contracts';
import { request } from './api';

export const sourceMethods = { EMBEDDED_SUBTITLE: 'Embedded subtitles', ASR: 'Speech recognition', OCR: 'Burned-in subtitles' };
export function isTextSubtitle(codec: string | null) {
  return ['subrip', 'srt', 'ass', 'ssa', 'webvtt', 'mov_text', 'text'].includes(codec ?? '');
}
export function embeddedLanguage(language: string | null): 'en' | 'zh' | 'zh-CN' | 'zh-TW' | null {
  if (language === 'eng' || language === 'en') return 'en';
  if (language === 'chi' || language === 'zho' || language === 'zh') return 'zh';
  if (language === 'zh-CN' || language === 'zh-TW') return language;
  return null;
}
export function sourceTimestamp(milliseconds: number) {
  const hours = Math.floor(milliseconds / 3600000);
  const minutes = Math.floor(milliseconds / 60000) % 60;
  const seconds = Math.floor(milliseconds / 1000) % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds % 1000).padStart(3, '0')}`;
}
export function runActive(run: ExtractionRunDto) { return run.status === 'QUEUED' || run.status === 'PROCESSING'; }
export function sourceGroup(run: ExtractionRunDto) { return `${sourceMethods[run.method]} · ${run.languageDetected || run.languageRequested || 'Auto / unknown'}`; }
export function selectedSourceRun<T extends { id: string }>(page: readonly T[], selected: T | null): T | undefined {
  return selected ? page.find(run => run.id === selected.id) ?? selected : page[0];
}

export function queueEmbedded(episodeId: string, body: unknown) {
  return request(`/episodes/${episodeId}/source-extractions/embedded`, extractionRunSchema, { method: 'POST', body: embeddedRequestSchema.parse(body) });
}
export function queueAsr(episodeId: string, body: unknown) {
  return request(`/episodes/${episodeId}/source-extractions/asr`, extractionRunSchema, { method: 'POST', body: asrRequestSchema.parse(body) });
}
export function queueOcr(episodeId: string, body: unknown) {
  return request(`/episodes/${episodeId}/source-extractions/ocr`, extractionRunSchema, { method: 'POST', body: ocrRequestSchema.parse(body) });
}
export function rerunSource(run: ExtractionRunDto, rerunKey: string) {
  const { method, ...settings } = run.settings;
  const body = { ...settings, mediaAssetId: run.mediaAssetId, rerunKey };
  if (method === 'EMBEDDED_SUBTITLE') return queueEmbedded(run.episodeId, body);
  if (method === 'ASR') return queueAsr(run.episodeId, body);
  return queueOcr(run.episodeId, body);
}
