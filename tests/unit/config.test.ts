import { expect, it } from 'vitest';
import { loadConfig } from '../../packages/config/src/index';
it('validates required environment without exposing secret values', () => {
  expect(() => loadConfig({})).toThrow('Invalid server configuration');
  expect(() => loadConfig({ DATABASE_URL: 'a-secret-value', REDIS_URL: 'bad' })).toThrow('DATABASE_URL');
  expect(() => loadConfig({ DATABASE_URL: 'a-secret-value', REDIS_URL: 'bad' })).not.toThrow('a-secret-value');
});
