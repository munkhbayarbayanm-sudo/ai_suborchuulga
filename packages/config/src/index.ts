import { z } from 'zod';
const url = (protocols: string[]) => z.string().url().refine(value => { try { return protocols.includes(new URL(value).protocol); } catch { return false; } });
const schema = z.object({
  DATABASE_URL: url(['postgres:', 'postgresql:']), REDIS_URL: url(['redis:', 'rediss:']),
  STORAGE_ROOT: z.string().min(1).default('./data/media'),
  API_HOST: z.string().default('127.0.0.1'), API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_ORIGIN: z.string().url().default('http://127.0.0.1:3000'),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).default(2147483648),
  FFPROBE_PATH: z.string().min(1).default('ffprobe'), FFMPEG_PATH: z.string().min(1).default('ffmpeg'),
  MEDIA_PROCESS_TIMEOUT_MS: z.coerce.number().int().min(100).max(600000).default(60000),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2)
});
export type Config = z.infer<typeof schema>;
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) throw new Error(`Invalid server configuration: ${parsed.error.issues.map(i => i.path.join('.')).join(', ')}`);
  return parsed.data;
}
