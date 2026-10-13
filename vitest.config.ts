import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { fileParallelism: false, projects: [
  { test: { name: 'unit', include: ['tests/unit/**/*.test.ts', 'apps/web/lib/**/*.test.ts'], testTimeout: 15000 } },
  { test: { name: 'integration', include: ['tests/integration/**/*.test.ts'], testTimeout: 60000, hookTimeout: 60000 } }
] } });
