import { z } from 'zod';
import { segmentEvidenceSchema } from '@mongolsub/contracts';
import { AppError } from '@mongolsub/domain';
import type { FusionInput } from './types';
const inputSchema = z.array(z.object({ id: z.string().min(1), method: z.enum(['EMBEDDED_SUBTITLE', 'ASR', 'OCR']), segments: z.array(segmentEvidenceSchema.and(z.object({ id: z.string().min(1), extractionRunId: z.string().min(1), sequence: z.number().int().nonnegative() }))) })).min(1).max(12);
export function validateInputs(inputs: FusionInput[]): FusionInput[] {
  if (!Array.isArray(inputs) || inputs.some(i => !i || !Array.isArray(i.segments)) || inputs.reduce((n, i) => n + i.segments.length, 0) > 50000) throw new AppError('FUSION_INVALID_INPUT', 'Fusion supports at most 50,000 selected source segments.');
  const parsed = inputSchema.safeParse(inputs);
  if (!parsed.success) throw new AppError('FUSION_INVALID_INPUT', 'Fusion source evidence is invalid.');
  const ids = new Set<string>(); const runIds = new Set<string>();
  for (const input of parsed.data) {
    if (runIds.has(input.id)) throw new AppError('FUSION_INVALID_INPUT', 'Extraction runs must be selected once.'); runIds.add(input.id);
    for (const s of input.segments) { if (s.extractionRunId !== input.id || ids.has(s.id)) throw new AppError('FUSION_INVALID_INPUT', 'Source segment ownership or identity is invalid.'); ids.add(s.id); }
  }
  return parsed.data.map((input, i) => ({ ...input, segments: input.segments.map((s, n) => ({ ...s, text: inputs[i]!.segments[n]!.text })) }));
}
