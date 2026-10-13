import { expect, it } from 'vitest';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { receiveVideo } from '../../apps/api/src/upload';
import type { StorageProvider } from '../../packages/storage/src/index';
it('returns a useful failure promptly when storage cannot open an upload', async () => {
  const storage: StorageProvider = {
    put: async () => { throw new Error('disk unavailable'); },
    delete: async () => {}, materialize: async () => { throw new Error('unused'); }
  };
  const server = createServer((request, response) => {
    void receiveVideo(request, storage, 1000000).then(() => response.end('unexpected success')).catch(error => { response.statusCode = 503; response.end(error.code); });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Server address unavailable');
  try {
    const body = Buffer.concat([Buffer.from('--studio\r\nContent-Disposition: form-data; name="file"; filename="test.mp4"\r\nContent-Type: video/mp4\r\n\r\n'), Buffer.alloc(100000), Buffer.from('\r\n--studio--\r\n')]);
    const response = await fetch(`http://127.0.0.1:${address.port}`, { method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=studio' }, body, signal: AbortSignal.timeout(2000) });
    expect(response.status).toBe(503); expect(await response.text()).toBe('UPLOAD_STORAGE_FAILED');
    const malformed = await fetch(`http://127.0.0.1:${address.port}`, { method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=studio' }, body: '--studio\r\nContent-Disposition: form-data; name="file"; filename="a.txt"\r\nContent-Type: text/plain\r\n\r\ntruncated', signal: AbortSignal.timeout(2000) });
    expect(await malformed.text()).toBe('INVALID_UPLOAD');
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
