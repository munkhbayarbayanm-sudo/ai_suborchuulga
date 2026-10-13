import { errorSchema, importResultSchema } from '@mongolsub/contracts';

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000').replace(/\/$/, '');
export interface Parser<T> { parse(value: unknown): T }

export class ApiError extends Error {
  constructor(message: string, readonly code: string, readonly status?: number) { super(message); this.name = 'ApiError'; }
}

function readJson(text: string): unknown {
  try { return JSON.parse(text); }
  catch { throw new ApiError('The server returned an unreadable response. Try again.', 'INVALID_RESPONSE'); }
}

function serverError(value: unknown, status: number): ApiError {
  const parsed = errorSchema.safeParse(value);
  return parsed.success ? new ApiError(parsed.data.message, parsed.data.code, status)
    : new ApiError(`The request failed (${status}). Try again.`, 'REQUEST_FAILED', status);
}

function validate<T>(value: unknown, schema: Parser<T>): T {
  try { return schema.parse(value); }
  catch { throw new ApiError('The server response did not match the expected format. Refresh and try again.', 'INVALID_RESPONSE'); }
}

export async function request<T>(path: string, schema: Parser<T>, options: { method?: 'POST' | 'PATCH'; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method || 'GET',
      ...(options.body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(options.body) }),
      cache: 'no-store', signal: options.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new ApiError('Cannot reach the studio API. Check that the local services are running, then try again.', 'API_UNREACHABLE');
  }
  const value = readJson(await response.text());
  if (!response.ok) throw serverError(value, response.status);
  return validate(value, schema);
}

export function uploadMedia(episodeId: string, file: File, onProgress: (value: number) => void, signal: AbortSignal) {
  return new Promise<ReturnType<typeof importResultSchema.parse>>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const cleanup = () => signal.removeEventListener('abort', abort);
    xhr.open('POST', `${API_URL}/episodes/${encodeURIComponent(episodeId)}/media`);
    xhr.timeout = 30 * 60 * 1000;
    xhr.upload.onprogress = event => { if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100)); };
    xhr.onload = () => {
      cleanup();
      try {
        const value = readJson(xhr.responseText);
        if (xhr.status < 200 || xhr.status >= 300) throw serverError(value, xhr.status);
        resolve(validate(value, importResultSchema));
      } catch (error) { reject(error); }
    };
    xhr.onerror = () => { cleanup(); reject(new ApiError('The upload connection failed. Check the API and import the file again.', 'UPLOAD_FAILED')); };
    xhr.ontimeout = () => { cleanup(); reject(new ApiError('The upload timed out. Check your connection and try again.', 'UPLOAD_TIMEOUT')); };
    xhr.onabort = () => { cleanup(); reject(new DOMException('Upload cancelled', 'AbortError')); };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { cleanup(); reject(new DOMException('Upload cancelled', 'AbortError')); return; }
    const body = new FormData();
    body.append('file', file);
    xhr.send(body);
  });
}

export function errorText(error: unknown) { return error instanceof Error ? error.message : 'Something went wrong. Try again.'; }
