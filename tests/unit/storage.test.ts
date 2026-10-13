import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { LocalStorage } from '../../packages/storage/src/index';
let root: string;
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); });
describe('streaming storage', () => {
  it('persists streamed bytes under an opaque key and resolves a worker lease', async () => {
    root = await mkdtemp(join(tmpdir(), 'mongolsub-storage-'));
    const storage = new LocalStorage(root);
    const result = await storage.put(Readable.from(['hello', ' world']), 20);
    expect(result.sizeBytes).toBe(11n);
    const lease = await storage.materialize(result.key);
    expect(lease.path.startsWith(root)).toBe(true);
    await lease.release();
    await storage.delete(result.key);
    expect(await readdir(root)).toHaveLength(0);
  });
  it('rejects oversized and empty streams without leaving partial files', async () => {
    root = await mkdtemp(join(tmpdir(), 'mongolsub-storage-'));
    const storage = new LocalStorage(root);
    await expect(storage.put(Readable.from(['oversized']), 2)).rejects.toMatchObject({ code: 'UPLOAD_TOO_LARGE' });
    await expect(storage.put(Readable.from([]), 20)).rejects.toMatchObject({ code: 'EMPTY_UPLOAD' });
    expect(await readdir(root)).toHaveLength(0);
  });
  it('rejects traversal keys', async () => {
    root = await mkdtemp(join(tmpdir(), 'mongolsub-storage-'));
    await expect(new LocalStorage(root).materialize('../secret')).rejects.toMatchObject({ code: 'INVALID_STORAGE_KEY' });
  });
  it('cleans up a disconnected stream', async () => {
    root = await mkdtemp(join(tmpdir(), 'mongolsub-storage-'));
    const stream = Readable.from((async function* () { yield 'partial'; throw new Error('disconnected'); })());
    await expect(new LocalStorage(root).put(stream, 100)).rejects.toThrow('disconnected');
    expect(await readdir(root)).toHaveLength(0);
  });
});
