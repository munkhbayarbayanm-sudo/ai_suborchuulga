import {z} from 'zod';
import {idSchema, jobSchema, jobStatus} from './common';
import {canonicalLanguageSchema, reviewCategorySchema, reviewStatusSchema} from './fusion';

export const localizationModeSchema=z.enum(['STRICT','NATURAL','CINEMATIC']);
export const localizationEditStateSchema=z.enum(['PENDING','AI_GENERATED','AI_REVISED','MANUALLY_EDITED']);
export const localizationProviderReadinessSchema=z.object({status:z.enum(['READY','MISCONFIGURED','UNAVAILABLE']),message:z.string().min(1).max(500),provider:z.string().min(1).max(80),model:z.string().max(120)}).strict();
export const localizationSettingsSchema=z.object({
  batchSize:z.number().int().min(1).max(40).default(20),
  contextBefore:z.number().int().min(3).max(10).default(5),
  contextAfter:z.number().int().min(3).max(10).default(5),
  maxContextCharacters:z.number().int().min(1000).max(60000).default(24000),
  maxProviderRequestCharacters:z.number().int().min(4000).max(120000).default(48000),
  speakerBindings:z.array(z.object({speaker:z.string().trim().min(1).max(200),characterId:idSchema}).strict()).max(100).default([]),
}).strict().default({}).superRefine((v,ctx)=>{if(new Set(v.speakerBindings.map(b=>b.speaker)).size!==v.speakerBindings.length)ctx.addIssue({code:'custom',message:'Bind each speaker only once.'});});
export const localizationRequestSchema=z.object({fusionRunId:idSchema,mode:localizationModeSchema.default('NATURAL'),settings:localizationSettingsSchema,rerunKey:idSchema.optional()}).strict();
export const localizationIssueCodeSchema=z.enum(['NEGATION','PERSON','NUMBER','NAME','RELATIONSHIP','MISSING_CLAUSE','INVENTED_FACT','NATURALNESS','CONTEXT_UNCERTAINTY','GLOSSARY','SOURCE_UNCERTAIN','NUMBER_MISMATCH','NEGATION_UNCERTAIN','NAME_UNCERTAIN','GLOSSARY_UNCERTAIN','READING_LOAD','PROVIDER_CONFIDENCE_MISSING']);
export const localizationReasonSchema=z.object({code:localizationIssueCodeSchema,severity:z.enum(['INFO','REVIEW','SEVERE']),message:z.string().trim().min(1).max(500)}).strict();
const count=z.number().int().nonnegative();
const ratio=z.number().min(0).max(1);
const timestamps={createdAt:z.string().datetime(),updatedAt:z.string().datetime()};
export const localizationContextSummarySchema=z.object({characterCount:count,relationshipCount:count,glossaryCount:count,translationMemoryCount:count,approvedLineCount:count,estimatedInputTokens:count}).strict();
export const localizationRunSchema=z.object({
  id:idSchema,episodeId:idSchema,fusionRunId:idSchema,sourceLanguage:canonicalLanguageSchema,targetLanguage:z.literal('mn'),mode:localizationModeSchema,
  provider:z.string(),model:z.string(),providerVersion:z.string().nullable(),promptVersion:z.string(),pipelineVersion:z.string(),settings:localizationSettingsSchema,status:jobStatus,stage:z.string().nullable(),processingJobId:idSchema,job:jobSchema,
  revision:z.string(),segmentCount:count,completedSegmentCount:count,highConfidenceCount:count,reviewRecommendedCount:count,likelyProblemCount:count,
  inputTokens:count.nullable(),outputTokens:count.nullable(),cachedTokens:count.nullable(),estimatedCost:z.number().nonnegative().nullable(),usageComplete:z.boolean(),progress:z.number().min(0).max(100),
  contextSummary:localizationContextSummarySchema.nullable(),batchCount:count,completedBatchCount:count,processingDurationMs:count.nullable(),isActive:z.boolean(),...timestamps,startedAt:z.string().datetime().nullable(),completedAt:z.string().datetime().nullable(),
});
export const localizedSegmentSchema=z.object({
  id:idSchema,localizationRunId:idSchema,transcriptSegmentId:idSchema,sequence:count,sourceTextSnapshot:z.string().min(1),sourceStartMs:count,sourceEndMs:count,sourceConfidence:ratio,sourceReviewCategory:reviewCategorySchema,sourceReviewStatus:reviewStatusSchema,sourceEditRevision:count,sourceSpeaker:z.string().nullable(),
  machineDraft:z.string().nullable(),currentText:z.string().nullable(),confidence:ratio.nullable(),providerConfidence:ratio.nullable(),confidenceReasons:z.array(localizationReasonSchema).max(100),reviewClassification:reviewCategorySchema.nullable(),editState:localizationEditStateSchema,humanReviewState:reviewStatusSchema,revision:count,
  characterCount:count.nullable(),readingLoad:z.number().nonnegative().nullable(),alternativeTranslation:z.string().nullable(),suggestedLineBreak:z.string().nullable(),...timestamps,
}).refine(value=>value.sourceEndMs>value.sourceStartMs,{message:'Source end must be after source start.',path:['sourceEndMs']});
export const localizationPatchSchema=z.object({expectedRevision:count,currentText:z.string().trim().min(1).max(20000).optional(),humanReviewState:reviewStatusSchema.optional()}).strict().refine(v=>v.currentText!==undefined||v.humanReviewState!==undefined,'Provide text or human review state.');
export const localizationApprovalSchema=z.object({expectedRevision:count}).strict();
export const localizationQuerySchema=z.object({offset:z.coerce.number().int().min(0).max(1000000).default(0),limit:z.coerce.number().int().min(1).max(100).default(25),filter:z.enum(['ALL','NEEDS_REVIEW','LIKELY_PROBLEM','HIGH_CONFIDENCE','MANUAL','APPROVED']).default('ALL')}).strict();
const page={total:count,offset:count,limit:count.positive()};
export const localizationPageSchema=z.object({items:z.array(localizationRunSchema),...page,activeRunId:idSchema.nullable()});
export const localizedSegmentPageSchema=z.object({run:localizationRunSchema,items:z.array(localizedSegmentSchema),...page});
export type LocalizationMode=z.infer<typeof localizationModeSchema>;
export type LocalizationSettings=z.infer<typeof localizationSettingsSchema>;
export type LocalizationRunDto=z.infer<typeof localizationRunSchema>;
export type LocalizedSegmentDto=z.infer<typeof localizedSegmentSchema>;
export type LocalizationReason=z.infer<typeof localizationReasonSchema>;
export type LocalizationProviderReadiness=z.infer<typeof localizationProviderReadinessSchema>;
