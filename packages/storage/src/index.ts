import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { access, mkdir, rename, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AppError } from '@mongolsub/domain';

export interface StoredObject { key: string; sizeBytes: bigint }
export interface MediaLease { path: string; release(): Promise<void> }
export interface StorageProvider {
  put(source: Readable, maxBytes: number): Promise<StoredObject>;
  delete(key: string): Promise<void>;
  materialize(key: string): Promise<MediaLease>;
}
export class LocalStorage implements StorageProvider {
  private readonly root: string;
  constructor(root: string) { this.root = resolve(root); }
  private path(key: string): string {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(key)) throw new AppError('INVALID_STORAGE_KEY', 'Invalid media storage reference.');
    return join(this.root, key);
  }
  async put(source: Readable, maxBytes: number): Promise<StoredObject> {
    await mkdir(this.root, { recursive: true });
    const key = randomUUID();
    const finalPath = this.path(key);
    const partial = `${finalPath}.partial`;
    let sizeBytes = 0n;
    const counter = new Transform({ transform(chunk: Buffer, _encoding, done) {
      sizeBytes += BigInt(chunk.length);
      if (sizeBytes > BigInt(maxBytes)) done(new AppError('UPLOAD_TOO_LARGE', `Video exceeds the ${maxBytes} byte upload limit.`, 413));
      else done(null, chunk);
    } });
    try {
      await pipeline(source, counter, createWriteStream(partial, { flags: 'wx' }));
      if (sizeBytes === 0n) throw new AppError('EMPTY_UPLOAD', 'Select a non-empty video.');
      await rename(partial, finalPath);
      return { key, sizeBytes };
    } catch (error) { await rm(partial, { force: true }); throw error; }
  }
  async materialize(key: string): Promise<MediaLease> {
    const path = this.path(key);
    try { await access(path); } catch { throw new AppError('MEDIA_NOT_FOUND', 'The original media is missing from storage.', 404); }
    // A remote provider may download to a temporary worker lease and remove it here.
    return { path, release: async () => {} };
  }
  async delete(key: string): Promise<void> { await rm(this.path(key), { force: true }); }
}
