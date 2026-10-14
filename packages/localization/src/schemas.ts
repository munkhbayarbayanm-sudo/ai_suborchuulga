import { z } from 'zod';
import {
  characterSchema,
  glossaryEntrySchema,
  idSchema,
  relationshipSchema,
  reviewCategorySchema,
  reviewStatusSchema,
  seriesLocalizationProfileSchema,
  translationMemoryEntrySchema,
} from '@mongolsub/contracts';

const milliseconds = z.number().int().nonnegative().max(2_147_483_647);

export const localizationSourceSchema = z.object({
  id: idSchema,
  sequence: z.number().int().nonnegative(),
  text: z.string().min(1).max(20_000),
  startMs: milliseconds,
  endMs: milliseconds,
  speaker: z.string().max(100).nullable(),
  confidence: z.number().min(0).max(1),
  reviewCategory: reviewCategorySchema,
  reviewStatus: reviewStatusSchema,
  editRevision: z.number().int().nonnegative(),
}).strict().refine((value) => value.endMs > value.startMs, {
  message: 'Source end must be after source start.',
  path: ['endMs'],
});

export const localizationSnapshotSchema = z.object({
  seriesId: idSchema,
  episodeId: idSchema,
  fusionRunId: idSchema,
  sourceLanguage: z.enum(['en', 'zh']),
  profile: seriesLocalizationProfileSchema,
  characters: z.array(characterSchema.omit({ createdAt: true, updatedAt: true })).max(10_000),
  relationships: z.array(relationshipSchema.omit({ createdAt: true, updatedAt: true })).max(50_000),
  glossary: z.array(glossaryEntrySchema.omit({ createdAt: true, updatedAt: true })).max(50_000),
  translationMemory: z.array(translationMemoryEntrySchema.omit({ createdAt: true, updatedAt: true })).max(50_000),
  previousApprovedLines: z.array(z.object({
    fusionRunId: idSchema,
    sequence: z.number().int().nonnegative(),
    text: z.string().min(1).max(20_000),
  }).strict()).max(50_000),
}).strict();
