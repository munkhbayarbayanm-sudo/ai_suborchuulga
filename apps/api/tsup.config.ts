import { defineConfig } from 'tsup';
export default defineConfig({ entry: ['src/main.ts'], format: ['esm'], target: 'node22', platform: 'node', sourcemap: true, clean: true, noExternal: [/^@mongolsub\//], external: ['@prisma/client', 'bullmq', 'ioredis'] });
