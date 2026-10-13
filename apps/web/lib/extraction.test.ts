import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractionRunSchema } from '@mongolsub/contracts';
import { embeddedLanguage, isTextSubtitle, queueAsr, queueOcr, rerunSource, selectedSourceRun, sourceTimestamp } from './extraction';

afterEach(() => vi.unstubAllGlobals());

describe('source extraction presentation', () => {
  it('enables text subtitles but leaves bitmap and unknown tracks unsupported', () => {
    expect(isTextSubtitle('ass')).toBe(true);
    expect(isTextSubtitle('mov_text')).toBe(true);
    expect(isTextSubtitle('hdmv_pgs_subtitle')).toBe(false);
    expect(isTextSubtitle('dvd_subtitle')).toBe(false);
    expect(isTextSubtitle(null)).toBe(false);
  });
  it('preserves known Chinese script tags without inventing a language for unknown tracks', () => {
    expect(embeddedLanguage('eng')).toBe('en');
    expect(embeddedLanguage('zho')).toBe('zh');
    expect(embeddedLanguage('zh-TW')).toBe('zh-TW');
    expect(embeddedLanguage('zh-CN')).toBe('zh-CN');
    expect(embeddedLanguage('und')).toBe(null);
  });
  it('displays millisecond timing without truncating long episode hours', () => {
    expect(sourceTimestamp(3723456)).toBe('01:02:03.456');
    expect(sourceTimestamp(0)).toBe('00:00:00.000');
  });
});

describe('source extraction API requests', () => {
  const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const timestamp = '2026-10-13T00:00:00.000Z';
  function rejectingServer() {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'PROVIDER_UNAVAILABLE', message: 'Provider unavailable' }), { status: 503 }));
    vi.stubGlobal('fetch', fetch);
    return fetch;
  }
  it('sends the explicitly selected audio stream with ordinary idempotency and ASR defaults', async () => {
    const fetch = rejectingServer();
    await expect(queueAsr(id, { mediaAssetId: id, streamIndex: 7, language: null })).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
    expect(JSON.parse(fetch.mock.calls[0]?.[1].body as string)).toEqual({ mediaAssetId: id, streamIndex: 7, language: null, align: true, diarize: false });
  });
  it('validates OCR settings before any network request', () => {
    const fetch = rejectingServer();
    expect(() => queueOcr(id, { mediaAssetId: id, language: 'en', fps: 30 })).toThrow();
    expect(() => queueOcr(id, { mediaAssetId: id, language: 'zh-TW', bottomFraction: 0.1 })).toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('sends an intentional rerun key while preserving original settings and selected stream', async () => {
    const fetch = rejectingServer();
    const run = extractionRunSchema.parse({
      id, episodeId: id, mediaAssetId: id, method: 'ASR', provider: 'whisperx', providerVersion: '1', modelVersion: 'tiny', streamIndex: 7,
      languageRequested: 'zh', languageDetected: 'zh', revision: '0', status: 'FAILED',
      settings: { method: 'ASR', streamIndex: 7, language: 'zh', align: false, diarize: true }, processingJobId: id,
      job: { id, jobType: 'TRANSCRIBE_AUDIO', status: 'FAILED', progress: 0, episodeId: id, mediaAssetId: id, errorCode: 'PROVIDER_UNAVAILABLE', errorMessage: 'Provider unavailable', startedAt: null, completedAt: timestamp, createdAt: timestamp, updatedAt: timestamp },
      segmentCount: 0, stage: 'FAILED', processingDurationMs: null, device: null, startedAt: null, completedAt: timestamp, createdAt: timestamp, updatedAt: timestamp,
    });
    const rerunKey = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    await expect(rerunSource(run, rerunKey)).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
    expect(JSON.parse(fetch.mock.calls[0]?.[1].body as string)).toEqual({ mediaAssetId: id, streamIndex: 7, language: 'zh', align: false, diarize: true, rerunKey });
  });
});

describe('source result selection across history pages', () => {
  it('keeps the exact reused old run after a refresh drops it from the newest page', () => {
    const newest = { id: 'newest', status: 'COMPLETED' };
    const reused = { id: 'old-default', status: 'COMPLETED' };
    expect(selectedSourceRun([newest], reused)).toBe(reused);
    expect(selectedSourceRun([], reused)).toBe(reused);
  });
  it('prefers an updated snapshot of the selected ID without changing selection', () => {
    const queued = { id: 'selected', status: 'QUEUED' };
    const completed = { id: 'selected', status: 'COMPLETED' };
    expect(selectedSourceRun([{ id: 'unrelated', status: 'FAILED' }, completed], queued)).toBe(completed);
  });
  it('chooses the first history item only before a result was explicitly selected', () => {
    const newest = { id: 'newest' };
    expect(selectedSourceRun([newest], null)).toBe(newest);
    expect(selectedSourceRun([], null)).toBeUndefined();
  });
});
