import { afterEach, describe, expect, it, vi } from 'vitest';
import { healthSchema } from '@mongolsub/contracts';
import { ApiError, request, uploadMedia } from './api';

const health = { status: 'ok', database: true, redis: true, tools: { ffmpeg: true, ffprobe: true }, worker: { ready: true, lastSeenAt: null } };

afterEach(() => vi.unstubAllGlobals());

describe('studio API boundary', () => {
  it('accepts a contract-validated response', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(health)));
    vi.stubGlobal('fetch', fetch);
    expect(await request('/health', healthSchema)).toEqual(health);
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ cache: 'no-store', method: 'GET' });
  });

  it('rejects a successful response with malformed fields', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...health, database: 'yes' }))));
    await expect(request('/health', healthSchema)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('does not expose an unexpected server payload', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ stack: 'private database details' }), { status: 500 })));
    await expect(request('/health', healthSchema)).rejects.toMatchObject({ code: 'REQUEST_FAILED', message: 'The request failed (500). Try again.' });
  });

  it('preserves a structured application failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'NOT_FOUND', message: 'Series not found' }), { status: 404 })));
    await expect(request('/health', healthSchema)).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'Series not found', status: 404 });
  });

  it('maps connection failures to actionable text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(request('/health', healthSchema)).rejects.toBeInstanceOf(ApiError);
    await expect(request('/health', healthSchema)).rejects.toMatchObject({ code: 'API_UNREACHABLE' });
  });

  it('preserves cancellation without showing a connection failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError')));
    await expect(request('/health', healthSchema)).rejects.toMatchObject({ name: 'AbortError' });
  });
});

class UploadRequest {
  static current: UploadRequest;
  timeout = 0;
  status = 201;
  responseText = '';
  upload: { onprogress?: (event: { lengthComputable: boolean; loaded: number; total: number }) => void } = {};
  onload?: () => void;
  onerror?: () => void;
  ontimeout?: () => void;
  onabort?: () => void;
  open = vi.fn();
  send = vi.fn();
  setRequestHeader = vi.fn();
  abort = vi.fn(() => this.onabort?.());
  constructor() { UploadRequest.current = this; }
}

describe('multipart import', () => {
  it('sends one file without manually setting multipart Content-Type, and reports progress', async () => {
    vi.stubGlobal('XMLHttpRequest', UploadRequest);
    const progress = vi.fn();
    const promise = uploadMedia('episode', new File(['video'], 'episode.mp4'), progress, new AbortController().signal);
    const xhr = UploadRequest.current;
    const body = xhr.send.mock.calls[0]?.[0];
    expect(body).toBeInstanceOf(FormData);
    expect(Array.from((body as FormData).keys())).toEqual(['file']);
    expect(xhr.setRequestHeader).not.toHaveBeenCalled();
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 2, total: 4 });
    expect(progress).toHaveBeenCalledWith(50);
    xhr.status = 413;
    xhr.responseText = JSON.stringify({ code: 'UPLOAD_TOO_LARGE', message: 'This file exceeds the upload limit.' });
    xhr.onload?.();
    await expect(promise).rejects.toMatchObject({ code: 'UPLOAD_TOO_LARGE' });
  });

  it('aborts a pending upload when the workspace unmounts', async () => {
    vi.stubGlobal('XMLHttpRequest', UploadRequest);
    const controller = new AbortController();
    const promise = uploadMedia('episode', new File(['video'], 'episode.mp4'), vi.fn(), controller.signal);
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(UploadRequest.current.abort).toHaveBeenCalledOnce();
  });

  it('rejects an invalid upload success response', async () => {
    vi.stubGlobal('XMLHttpRequest', UploadRequest);
    const promise = uploadMedia('episode', new File(['video'], 'episode.mp4'), vi.fn(), new AbortController().signal);
    UploadRequest.current.responseText = JSON.stringify({ asset: {}, job: {} });
    UploadRequest.current.onload?.();
    await expect(promise).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});
