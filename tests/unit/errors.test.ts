import { expect, it } from 'vitest';
import { AppError, errorDiagnostics } from '../../packages/domain/src/index';
it('retains a bounded safe system code without arbitrary exception values', () => {
  expect(errorDiagnostics(Object.assign(new Error('password=secret'), { code: 'ENOENT', path: '/secret/location' }))).toEqual({ errorType: 'Error', systemCode: 'ENOENT' });
  expect(JSON.stringify(errorDiagnostics({ code: 'password=secret', message: 'secret' }))).not.toContain('secret');
  expect(new AppError('FAILED', 'Friendly', 400, { toolExitCode: 7 }).diagnostics).toEqual({ toolExitCode: 7 });
});
