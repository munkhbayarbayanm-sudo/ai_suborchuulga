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
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
  MEDIA_WORK_ROOT: z.string().min(1).default('./data/work'),
  EXTRACTION_PROVIDER_URL: url(['http:']).refine(value => ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(value).hostname), 'Inference must use loopback').default('http://127.0.0.1:8765'),
  EXTRACTION_PROVIDER_TOKEN: z.string().default(''),
  EXTRACTION_TIMEOUT_MS: z.coerce.number().int().min(1000).max(86400000).default(7200000),
  OCR_MAX_FRAMES: z.coerce.number().int().min(1).max(100000).default(20000),
  RENDER_PROCESS_TIMEOUT_MS: z.coerce.number().int().min(1000).max(86400000).default(21600000),
  MAX_RENDER_OUTPUT_BYTES: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).default(10737418240),
  LOCALIZATION_PROVIDER: z.enum(['openai','disabled']).default('openai'),
  LOCALIZATION_API_KEY: z.string().default(''),
  LOCALIZATION_MODEL: z.string().max(120).default(''),
  LOCALIZATION_BASE_URL: url(['https:','http:']).refine(value => {
    const parsed = new URL(value);
    return !parsed.username && !parsed.password && !parsed.search && !parsed.hash && (parsed.protocol === 'https:' || ['127.0.0.1','localhost','[::1]'].includes(parsed.hostname));
  }, 'Provider endpoint must be HTTPS or loopback').default('https://api.openai.com/v1'),
  LOCALIZATION_TIMEOUT_MS: z.coerce.number().int().min(1000).max(600000).default(120000),
  LOCALIZATION_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(500).max(32000).default(10000),
  LOCALIZATION_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(3).default(3),
  LOCALIZATION_RETRY_BASE_MS: z.coerce.number().int().min(1).max(10000).default(1000)
});
export type Config = z.infer<typeof schema>;
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) throw new Error(`Invalid server configuration: ${parsed.error.issues.map(i => i.path.join('.')).join(', ')}`);
  return parsed.data;
}
