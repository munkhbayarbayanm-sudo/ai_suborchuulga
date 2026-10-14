import { z } from 'zod';
export const idSchema = z.string().uuid();
export const jobStatus = z.enum(['QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED']);
export const jobType = z.enum(['INSPECT_MEDIA', 'EXTRACT_EMBEDDED_SUBTITLE', 'TRANSCRIBE_AUDIO', 'OCR_BURNED_SUBTITLE','FUSE_TRANSCRIPT','LOCALIZE_TRANSCRIPT']);
export const jobSchema = z.object({ id: idSchema, jobType, status: jobStatus, progress: z.number().min(0).max(100), episodeId: idSchema.nullable(), mediaAssetId: idSchema.nullable(), errorCode: z.string().nullable(), errorMessage: z.string().nullable(), startedAt: z.string().datetime().nullable(), completedAt: z.string().datetime().nullable(), createdAt: z.string().datetime(), updatedAt: z.string().datetime() });
