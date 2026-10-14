import { expect, it } from 'vitest';
import { loadConfig } from '../../packages/config/src/index';
it('keeps core boot independent of localization credentials and rejects insecure provider config without exposing keys', () => {
  const base = { DATABASE_URL: 'postgresql://localhost/test', REDIS_URL: 'redis://localhost' };
  expect(loadConfig(base).LOCALIZATION_PROVIDER).toBe('openai');
  expect(loadConfig(base).LOCALIZATION_API_KEY).toBe('');
  expect(() => loadConfig({ ...base, LOCALIZATION_BASE_URL: 'http://untrusted.example', LOCALIZATION_API_KEY: 'private-test-secret' })).toThrow('LOCALIZATION_BASE_URL');
  expect(() => loadConfig({ ...base, LOCALIZATION_TIMEOUT_MS: '0', LOCALIZATION_API_KEY: 'private-test-secret' })).not.toThrow('private-test-secret');
});
