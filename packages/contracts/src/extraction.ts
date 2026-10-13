import { z } from 'zod';
import { idSchema, jobSchema, jobStatus } from './common';
export const extractionMethod = z.enum(['EMBEDDED_SUBTITLE', 'ASR', 'OCR']);
export const providerReadinessSchema = z.object({ provider: z.string().max(80), state: z.enum(['READY_CPU', 'READY_GPU', 'UNAVAILABLE']), version: z.string().max(120).nullable(), model: z.string().max(200).nullable(), message: z.string().max(1000).nullable() });
export const extractionReadinessSchema = z.object({ embedded: providerReadinessSchema, asr: providerReadinessSchema, ocr: providerReadinessSchema });
const baseRequest = { mediaAssetId: idSchema, streamIndex: z.number().int().nonnegative().max(255), rerunKey: idSchema.optional() };
export const embeddedRequestSchema = z.object({ ...baseRequest, language: z.enum(['en', 'zh', 'zh-CN', 'zh-TW']).nullable().optional() }).strict();
export const asrSettingsSchema = z.object({ language: z.enum(['en', 'zh']).nullable().default(null), align: z.boolean().default(true), diarize: z.boolean().default(false) }).strict();
export const asrRequestSchema = z.object({ ...baseRequest, ...asrSettingsSchema.shape }).strict();
export const ocrSettingsSchema = z.object({ language: z.enum(['en', 'zh-CN', 'zh-TW']), fps: z.number().min(1).max(10).default(4), region: z.enum(['BOTTOM_REGION', 'FULL_FRAME']).default('BOTTOM_REGION'), bottomFraction: z.number().min(0.2).max(0.6).default(0.4), minimumConfidence: z.number().min(0).max(1).default(0.5) }).strict();
export const ocrRequestSchema = z.object({ mediaAssetId: idSchema, rerunKey: idSchema.optional(), ...ocrSettingsSchema.shape }).strict();
export const wordSchema = z.object({ text: z.string().min(1).max(1000), startMs: z.number().int().nonnegative().nullable(), endMs: z.number().int().nonnegative().nullable(), confidence: z.number().min(0).max(1).nullable(), speaker: z.string().max(100).nullable() }).superRefine((v, ctx) => {
  if ((v.startMs === null) !== (v.endMs === null) || (v.startMs !== null && v.endMs !== null && v.endMs < v.startMs)) ctx.addIssue({ code: 'custom', message: 'Word timing must be both unknown or ordered.' });
});
export const segmentEvidenceSchema = z.object({ startMs: z.number().int().nonnegative().max(2147483646), endMs: z.number().int().positive().max(2147483647), text: z.string().trim().min(1).max(20000), language: z.string().max(35).nullable(), confidence: z.number().min(0).max(1).nullable(), speaker: z.string().max(100).nullable(), words: z.array(wordSchema).max(10000).default([]) }).superRefine((v,ctx)=>{
  if(v.endMs<=v.startMs)ctx.addIssue({code:'custom',message:'Segment end must be after start.'});
  let previous=v.startMs;
  for(const word of v.words)if(word.startMs!==null&&word.endMs!==null){
    if(word.startMs<v.startMs||word.endMs>v.endMs||word.startMs<previous)ctx.addIssue({code:'custom',message:'Timed words must be ordered and contained in their segment.'});
    previous=word.startMs;
  }
});
export const boxSchema = z.tuple([z.number().min(0).max(1), z.number().min(0).max(1), z.number().min(0).max(1), z.number().min(0).max(1)]);
export const segmentMetadataSchema = z.discriminatedUnion('provider', [
  z.object({ provider: z.literal('ffmpeg'), codec: z.string().max(100).nullable(), trackLanguage: z.string().max(100).nullable() }).strict(),
  z.object({ provider: z.literal('whisperx'), model: z.string().max(200), warnings: z.array(z.string().max(500)).max(20) }).strict(),
  z.object({ provider: z.literal('paddleocr'), model: z.string().max(200), representativeTimestampMs: z.number().int().nonnegative(), rawText: z.string().max(20000), box: boxSchema.nullable(), observationCount: z.number().int().positive() }).strict()
]);
export const sourceSegmentSchema = z.object({ id: idSchema, extractionRunId: idSchema, method: extractionMethod, sequence: z.number().int().nonnegative(), streamIndex: z.number().int().nonnegative().nullable(), createdAt: z.string().datetime(), startMs: z.number().int().nonnegative(), endMs: z.number().int().positive(), text: z.string(), language: z.string().nullable(), confidence: z.number().nullable(), speaker: z.string().nullable(), words: z.array(wordSchema), providerMetadata: segmentMetadataSchema });
export const runSettingsSchema = z.discriminatedUnion('method', [
  z.object({ method: z.literal('EMBEDDED_SUBTITLE'), streamIndex: z.number().int(), language: z.string().nullable() }).strict(),
  z.object({ method: z.literal('ASR'), streamIndex: z.number().int(), ...asrSettingsSchema.shape }).strict(),
  z.object({ method: z.literal('OCR'), ...ocrSettingsSchema.shape }).strict()
]);
export const extractionRunSchema = z.object({ id: idSchema, episodeId: idSchema, mediaAssetId: idSchema, method: extractionMethod, provider: z.string(), providerVersion: z.string().nullable(), modelVersion: z.string().nullable(), streamIndex: z.number().int().nullable(), languageRequested: z.string().nullable(), languageDetected: z.string().nullable(), revision: z.string(), status: jobStatus, settings: runSettingsSchema, processingJobId: idSchema, job: jobSchema, segmentCount: z.number().int().nonnegative(), stage: z.string().nullable(), processingDurationMs: z.number().int().nonnegative().nullable(), device: z.enum(['cpu', 'gpu']).nullable(), startedAt: z.string().datetime().nullable(), completedAt: z.string().datetime().nullable(), createdAt: z.string().datetime(), updatedAt: z.string().datetime() });
export const segmentPageSchema = z.object({ run: extractionRunSchema, items: z.array(sourceSegmentSchema), total: z.number().int().nonnegative(), offset: z.number().int().nonnegative(), limit: z.number().int().positive() });
export const runPageSchema = z.object({ items: z.array(extractionRunSchema), total: z.number().int().nonnegative(), offset: z.number().int().nonnegative(), limit: z.number().int().positive() });
export const paginationSchema = z.object({ offset: z.coerce.number().int().min(0).max(1000000).default(0), limit: z.coerce.number().int().min(1).max(100).default(50) }).strict();
export type ExtractionRunDto = z.infer<typeof extractionRunSchema>;
export type SourceSegmentDto = z.infer<typeof sourceSegmentSchema>;
export type RunSettings = z.infer<typeof runSettingsSchema>;
export type SegmentEvidence = z.infer<typeof segmentEvidenceSchema>;
export type ProviderReadiness = z.infer<typeof providerReadinessSchema>;
export type SegmentMetadata = z.infer<typeof segmentMetadataSchema>;
