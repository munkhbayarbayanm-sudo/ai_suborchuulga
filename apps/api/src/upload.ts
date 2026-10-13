import busboy from 'busboy';
import type { IncomingMessage } from 'node:http';
import { AppError } from '@mongolsub/domain';
import type { StorageProvider, StoredObject } from '@mongolsub/storage';
export interface VideoUpload { stored: StoredObject; filename: string; mimeType: string }
export async function receiveVideo(req: IncomingMessage, storage: StorageProvider, maxBytes: number): Promise<VideoUpload> {
  if (!req.headers['content-type']?.startsWith('multipart/form-data')) throw new AppError('UNSUPPORTED_UPLOAD', 'Upload a video using multipart/form-data.', 415);
  const length = Number(req.headers['content-length']);
  if (Number.isFinite(length) && length > maxBytes + 1024 * 1024) throw new AppError('UPLOAD_TOO_LARGE', 'Video exceeds the configured upload limit.', 413);
  let parser: ReturnType<typeof busboy>;
  try { parser = busboy({ headers: req.headers, defParamCharset: 'utf8', limits: { files: 1, fields: 0, parts: 2, fileSize: maxBytes + 1 } }); }
  catch { throw new AppError('INVALID_UPLOAD', 'The upload request is malformed.'); }
  let uploaded: VideoUpload | undefined; let problem: AppError | undefined;
  let save: Promise<void> = Promise.resolve();
  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const fail = (error: AppError) => {
        if (settled) return;
        settled = true;
        req.unpipe(parser);
        req.resume();
        reject(error);
        parser.destroy();
      };
      parser.on('file', (field, file, info) => {
        // Every stream needs an error listener, including rejected/drained files.
        file.on('error', () => fail(new AppError('INVALID_UPLOAD', 'The upload was interrupted or malformed.')));
        const filename = (info.filename ?? '').replace(/\\/g, '/').split('/').pop()?.replace(/\p{Cc}/gu, '').trim().slice(0, 255) ?? '';
        if (field !== 'file' || !filename || !/\.(mp4|mkv|mov|webm|avi|m4v|ts|m2ts|mpeg|mpg)$/i.test(filename) || !(info.mimeType.startsWith('video/') || info.mimeType === 'application/octet-stream')) {
          problem = new AppError('INVALID_VIDEO_UPLOAD', 'Choose one supported video file in the file field.'); file.resume(); return;
        }
        save = storage.put(file, maxBytes + 1).then(stored => {
          uploaded = { stored, filename, mimeType: info.mimeType.slice(0, 100) };
          if (file.truncated || stored.sizeBytes > BigInt(maxBytes)) problem = new AppError('UPLOAD_TOO_LARGE', 'Video exceeds the configured upload limit.', 413);
        }).catch(error => { problem = error instanceof AppError ? error : new AppError('UPLOAD_STORAGE_FAILED', 'The upload could not be saved. Check storage space and try again.', 503); fail(problem); });
      });
      parser.on('filesLimit', () => { problem = new AppError('INVALID_UPLOAD', 'Upload exactly one video.'); });
      parser.on('fieldsLimit', () => { problem = new AppError('INVALID_UPLOAD', 'Unexpected upload fields.'); });
      parser.on('partsLimit', () => { problem = new AppError('INVALID_UPLOAD', 'Upload exactly one video without extra fields.'); });
      parser.on('error', () => fail(new AppError('INVALID_UPLOAD', 'The upload request is malformed.')));
      const aborted = () => fail(new AppError('UPLOAD_ABORTED', 'The upload was interrupted.'));
      req.once('aborted', aborted);
      parser.on('close', () => { req.off('aborted', aborted); if (!settled) { settled = true; resolve(); } });
      req.pipe(parser);
    });
    await save;
    if (problem) throw problem;
    if (!uploaded) throw new AppError('EMPTY_UPLOAD', 'Select one non-empty video.');
    return uploaded;
  } catch (error) {
    await save;
    if (uploaded) await storage.delete(uploaded.stored.key);
    throw error;
  }
}
