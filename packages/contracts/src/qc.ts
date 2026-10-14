import {z} from 'zod';
import {idSchema,jobSchema} from './common';

const count=z.number().int().nonnegative();const iso=z.string().datetime();
export const qcRunKindSchema=z.enum(['DOCUMENT','SERIES']);
export const qcRunStatusSchema=z.enum(['QUEUED','PROCESSING','COMPLETED','FAILED','CANCELLED','STALE']);
export const qcSeveritySchema=z.enum(['INFO','WARNING','ERROR']);
export const qcIssueStateSchema=z.enum(['OPEN','RESOLVED','IGNORED']);
export const qcIssueCategorySchema=z.enum(['TIMING','READABILITY','LANGUAGE','TRANSLATION','CONSISTENCY']);
export const qcIssueTypeSchema=z.enum(['OUTSIDE_MEDIA','VERY_SHORT','VERY_LONG','OVERLAP','MINIMUM_GAP','TIMING_ORDER','DENSE_CLUSTER','EMPTY_TEXT','READING_SPEED','LINE_COUNT','LINE_LENGTH','AWKWARD_LINE_BREAK','WHITESPACE','DUPLICATE_CUE','REPEATED_PUNCTUATION','UNTRANSLATED_SOURCE','MIXED_LANGUAGE','NEGATION_RISK','NUMBER_MISMATCH','NAME_INCONSISTENT','GLOSSARY_INCONSISTENT','ADDRESS_SHIFT','SERIES_NAME_DRIFT','SERIES_GLOSSARY_DRIFT','AI_MEANING_RISK','AI_NATURALNESS','AI_CONTEXT_UNCERTAIN']);
export const qcAiModeSchema=z.enum(['OFF','PROBLEMATIC_ONLY','ALL']);
export const qcAiStageStatusSchema=z.enum(['NOT_REQUESTED','QUEUED','COMPLETED','UNAVAILABLE','FAILED','CANCELLED']);
export const qcSuggestionTypeSchema=z.enum(['UPDATE_TEXT','RESIZE_START','RESIZE_END','SPLIT_CUE']);
export const qcSuggestionStatusSchema=z.enum(['PENDING','APPLIED','REJECTED','STALE']);
export const qcProfileSettingsSchema=z.object({
  minimumCueDurationMs:z.number().int().min(50).max(10_000).default(500),maximumCueDurationMs:z.number().int().min(500).max(120_000).default(10_000),
  maximumCharactersPerSecond:z.number().min(1).max(100).default(22),maximumLineCount:z.number().int().min(1).max(8).default(2),maximumCharactersPerLine:z.number().int().min(5).max(200).default(42),
  minimumGapMs:z.number().int().min(0).max(5_000).default(80),allowOverlaps:z.boolean().default(false),denseClusterWindowMs:z.number().int().min(100).max(30_000).default(2_000),denseClusterCueCount:z.number().int().min(3).max(20).default(3),
  untranslatedDetection:z.boolean().default(true),aiMode:qcAiModeSchema.default('OFF'),
}).strict().default({}).refine(value=>value.maximumCueDurationMs>value.minimumCueDurationMs,'Maximum cue duration must exceed minimum duration.');
export const qcProfileInputSchema=z.object({name:z.string().trim().min(1).max(160),seriesId:idSchema.nullable().optional(),settings:qcProfileSettingsSchema}).strict();
export const qcProfilePatchSchema=z.object({name:z.string().trim().min(1).max(160).optional(),settings:qcProfileSettingsSchema.optional(),isArchived:z.boolean().optional()}).strict().refine(value=>Object.keys(value).length>0,'Provide at least one field.');
export const qcProfileSchema=z.object({id:idSchema,name:z.string(),seriesId:idSchema.nullable(),isSystemDefault:z.boolean(),isArchived:z.boolean(),settings:qcProfileSettingsSchema,createdAt:iso,updatedAt:iso}).strict();
export const qcRunCreateSchema=z.object({profileId:idSchema.nullable().optional(),aiMode:qcAiModeSchema.default('OFF'),requireAi:z.boolean().default(false),rerunKey:idSchema.optional(),documentIds:z.array(idSchema).min(1).max(500).optional()}).strict();
export const qcRunDocumentSchema=z.object({subtitleDocumentId:idSchema,episodeId:idSchema,documentRevision:count,documentName:z.string(),episodeTitle:z.string()}).strict();
export const qcRunSchema=z.object({id:idSchema,kind:qcRunKindSchema,subtitleDocumentId:idSchema.nullable(),seriesId:idSchema.nullable(),profileId:idSchema,processingJobId:idSchema,documentRevision:count.nullable(),status:qcRunStatusSchema,engineVersion:z.string(),settingsSnapshot:qcProfileSettingsSchema,aiMode:qcAiModeSchema,aiStageStatus:qcAiStageStatusSchema,aiProvider:z.string().nullable(),aiModel:z.string().nullable(),aiPromptVersion:z.string().nullable(),stage:z.string(),cueCount:count,passCount:count,infoCount:count,warningCount:count,errorCount:count,issueCount:count,missingActiveDocumentCount:count,startedAt:iso.nullable(),completedAt:iso.nullable(),createdAt:iso,updatedAt:iso,documents:z.array(qcRunDocumentSchema),job:jobSchema.nullable().optional()}).strict();
export const qcRunPageSchema=z.object({items:z.array(qcRunSchema),total:count,offset:count,limit:z.number().int().positive()}).strict();
export const qcSuggestionSchema=z.object({id:idSchema,qcIssueId:idSchema,type:qcSuggestionTypeSchema,status:qcSuggestionStatusSchema,payload:z.record(z.string(),z.unknown()),appliedEditorOperationId:idSchema.nullable(),createdAt:iso,updatedAt:iso}).strict();
export const qcIssueCueSchema=z.object({subtitleCueId:idSchema,subtitleDocumentId:idSchema,episodeId:idSchema,sequence:count,startMs:count,endMs:z.number().int().positive(),text:z.string(),isPrimary:z.boolean()}).strict();
export const qcIssueSchema=z.object({id:idSchema,qcRunId:idSchema,fingerprint:z.string().length(64),type:qcIssueTypeSchema,category:qcIssueCategorySchema,severity:qcSeveritySchema,state:qcIssueStateSchema,title:z.string(),explanation:z.string(),metrics:z.record(z.string(),z.unknown()),confidence:z.number().min(0).max(1).nullable(),ignoredReason:z.string().nullable(),resolvedAt:iso.nullable(),createdAt:iso,updatedAt:iso,cues:z.array(qcIssueCueSchema),suggestions:z.array(qcSuggestionSchema)}).strict();
export const qcIssuePageSchema=z.object({run:qcRunSchema,items:z.array(qcIssueSchema),total:count,offset:count,limit:z.number().int().positive()}).strict();
export const qcIssueFilterSchema=z.object({offset:z.coerce.number().int().min(0).max(1_000_000).default(0),limit:z.coerce.number().int().min(1).max(200).default(50),severity:qcSeveritySchema.optional(),category:qcIssueCategorySchema.optional(),type:qcIssueTypeSchema.optional(),state:qcIssueStateSchema.optional(),cueId:idSchema.optional()}).strict();
export const qcRunQuerySchema=z.object({offset:z.coerce.number().int().min(0).max(1_000_000).default(0),limit:z.coerce.number().int().min(1).max(100).default(25)}).strict();
export const qcIssuePatchSchema=z.object({state:qcIssueStateSchema,reason:z.string().trim().min(3).max(1000).nullable().optional()}).strict().superRefine((value,ctx)=>{if(value.state==='IGNORED'&&!value.reason)ctx.addIssue({code:'custom',message:'Ignored issues require a reason.',path:['reason']});});
export const qcApplySuggestionRequestSchema=z.object({suggestionId:idSchema,baseRevision:count,clientOperationId:idSchema.optional()}).strict();
export const qcPreviewRequestSchema=z.object({cueIds:z.array(idSchema).min(1).max(50),profileId:idSchema.nullable().optional()}).strict();
export const qcPreviewIssueSchema=z.object({fingerprint:z.string().length(64),type:qcIssueTypeSchema,category:qcIssueCategorySchema,severity:qcSeveritySchema,title:z.string(),explanation:z.string(),metrics:z.record(z.string(),z.unknown()),cueIds:z.array(idSchema),suggestions:z.array(z.object({type:qcSuggestionTypeSchema}).passthrough())}).strict();
export const qcPreviewSchema=z.object({documentRevision:count,checkedCueIds:z.array(idSchema),issues:z.array(qcPreviewIssueSchema)}).strict();
export type QCProfileSettingsDto=z.infer<typeof qcProfileSettingsSchema>;
export type QCProfileDto=z.infer<typeof qcProfileSchema>;
export type QCRunDto=z.infer<typeof qcRunSchema>;
export type QCIssueDto=z.infer<typeof qcIssueSchema>;
export type QCPreviewDto=z.infer<typeof qcPreviewSchema>;
