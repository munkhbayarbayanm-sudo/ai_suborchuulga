import { z } from 'zod';
import { AppError } from '@mongolsub/domain';
const int = z.number().int().nonnegative().max(2147483647);
const numeric = z.string().max(100).optional();
const payload = z.object({
  format: z.object({ duration: numeric, format_name: z.string().max(500).optional() }).optional(),
  streams: z.array(z.object({
    index: int, codec_type: z.string().max(100).optional(), codec_name: z.string().max(100).optional(),
    width: int.optional(), height: int.optional(), avg_frame_rate: numeric,
    channels: int.optional(), sample_rate: numeric,
    tags: z.object({ language: z.string().max(100).optional(), title: z.string().max(1000).optional() }).optional()
  })).min(1).max(256)
});
export interface InspectedStream {
  streamIndex: number; type: 'VIDEO' | 'AUDIO' | 'SUBTITLE' | 'OTHER'; codec: string | null;
  language: string | null; title: string | null; width: number | null; height: number | null;
  frameRate: number | null; channels: number | null; sampleRate: number | null;
}
export interface Inspection { durationMs: number | null; containerFormat: string | null; width: number | null; height: number | null; streams: InspectedStream[] }
function numberOrNull(value: string | undefined, max = 2147483647): number | null {
  if (value === undefined || value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
}
export function parseProbe(input: unknown): Inspection {
  const parsed = payload.safeParse(input);
  if (!parsed.success) throw new AppError('INVALID_PROBE_OUTPUT', 'The media tool returned invalid metadata.');
  const data = parsed.data;
  if (new Set(data.streams.map(s => s.index)).size !== data.streams.length) throw new AppError('INVALID_PROBE_OUTPUT', 'The media tool returned duplicate stream indices.');
  const streams: InspectedStream[] = data.streams.map(s => {
    const rateParts = s.avg_frame_rate?.split('/');
    const numerator = numberOrNull(rateParts?.[0]);
    const denominator = rateParts?.length === 2 ? numberOrNull(rateParts[1]) : 1;
    const rate = numerator !== null && denominator !== null && denominator > 0 ? numerator / denominator : null;
    const sampleRate = numberOrNull(s.sample_rate);
    return {
      streamIndex: s.index, type: s.codec_type === 'video' ? 'VIDEO' : s.codec_type === 'audio' ? 'AUDIO' : s.codec_type === 'subtitle' ? 'SUBTITLE' : 'OTHER',
      codec: s.codec_name ?? null, language: s.tags?.language ?? null, title: s.tags?.title ?? null,
      width: s.width ?? null, height: s.height ?? null, frameRate: rate !== null && rate > 0 && rate <= 1000 ? rate : null,
      channels: s.channels ?? null, sampleRate: sampleRate !== null && Number.isInteger(sampleRate) ? sampleRate : null
    };
  });
  const video = streams.find(s => s.type === 'VIDEO');
  const seconds = numberOrNull(data.format?.duration, 2147483.647);
  return { durationMs: seconds === null ? null : Math.round(seconds * 1000), containerFormat: data.format?.format_name ?? null, width: video?.width ?? null, height: video?.height ?? null, streams };
}
