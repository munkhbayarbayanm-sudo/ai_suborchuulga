import {z} from 'zod';
import {idSchema,jobSchema} from './common';
import {reviewCategorySchema,reviewStatusSchema} from './fusion';
import {localizationEditStateSchema,localizationReasonSchema} from './localization';

const count=z.number().int().nonnegative();const time=count;const iso=z.string().datetime();
export const subtitleDocumentStatusSchema=z.enum(['READY','ARCHIVED']);
export const subtitleCueStatusSchema=z.enum(['NORMAL','REVIEW','APPROVED']);
export const subtitleCueOriginSchema=z.enum(['LOCALIZED','MANUAL']);
export const editorOperationTypeSchema=z.enum(['UPDATE_TEXT','MOVE_CUE','RESIZE_START','RESIZE_END','SPLIT_CUE','MERGE_CUES','DELETE_CUE','CREATE_CUE','SET_CUE_STATUS','ACCEPT_AI_REWRITE','UNDO','REDO']);
export const editorRewriteActionSchema=z.enum(['RETRANSLATE','MAKE_NATURAL','SHORTER','MORE_FORMAL','MORE_CASUAL','CLOSER_TO_SOURCE']);
export const editorProposalStatusSchema=z.enum(['PENDING','ACCEPTED','REJECTED','SUPERSEDED']);
export const editorPreparationKindSchema=z.enum(['EDITOR_PROXY','WAVEFORM']);
export const editorPreparationStatusSchema=z.enum(['MISSING','QUEUED','PROCESSING','COMPLETED','FAILED','CANCELLED']);
export const createSubtitleDocumentSchema=z.object({name:z.string().trim().min(1).max(200).default('Mongolian subtitles'),initializationKey:idSchema.optional()}).strict().default({});
export const editorDocumentQuerySchema=z.object({offset:z.coerce.number().int().min(0).max(1000000).default(0),limit:z.coerce.number().int().min(1).max(100).default(25)}).strict();
export const editorCueQuerySchema=z.object({offset:z.coerce.number().int().min(0).max(1000000).default(0),limit:z.coerce.number().int().min(1).max(300).default(100),startMs:z.coerce.number().int().nonnegative().optional(),endMs:z.coerce.number().int().positive().optional(),filter:z.enum(['ALL','ISSUES','REVIEW','LIKELY_PROBLEM','MANUAL','APPROVED']).default('ALL')}).strict().refine(value=>value.startMs===undefined||value.endMs===undefined||value.endMs>value.startMs,'Window end must be after start.');
export const editorWordSchema=z.object({text:z.string(),startMs:time,endMs:time,confidence:z.number().min(0).max(1).nullable()}).strict().refine(value=>value.endMs>value.startMs,'Word end must be after start.');
export const subtitleCueSourceSchema=z.object({localizedSegmentId:idSchema,transcriptSegmentId:idSchema,sequence:count,sourceText:z.string(),localizedText:z.string(),reviewClassification:reviewCategorySchema.nullable(),humanReviewState:reviewStatusSchema,editState:localizationEditStateSchema,confidence:z.number().min(0).max(1).nullable(),confidenceReasons:z.array(localizationReasonSchema),speaker:z.string().nullable(),words:z.array(editorWordSchema)}).strict();
export const subtitleCueSchema=z.object({id:idSchema,subtitleDocumentId:idSchema,sequence:count,startMs:time,endMs:time,text:z.string(),status:subtitleCueStatusSchema,origin:subtitleCueOriginSchema,revision:count,deletedAt:iso.nullable(),createdAt:iso,updatedAt:iso,sources:z.array(subtitleCueSourceSchema),warnings:z.array(z.enum(['EMPTY_CUE','EXTREMELY_SHORT','OVERLAP','OUTSIDE_MEDIA']))}).strict().refine(value=>value.endMs>value.startMs,'Cue end must be after start.');
export const subtitleDocumentSchema=z.object({id:idSchema,episodeId:idSchema,mediaAssetId:idSchema,localizationRunId:idSchema,language:z.literal('mn'),name:z.string(),status:subtitleDocumentStatusSchema,editorVersion:z.string(),revision:count,isActive:z.boolean(),cueCount:count,durationMs:time,createdAt:iso,updatedAt:iso}).strict();
export const subtitleDocumentPageSchema=z.object({items:z.array(subtitleDocumentSchema),total:count,offset:count,limit:z.number().int().positive(),activeDocumentId:idSchema.nullable()}).strict();
export const editorHistoryStateSchema=z.object({canUndo:z.boolean(),canRedo:z.boolean(),undoOperationId:idSchema.nullable(),redoOperationId:idSchema.nullable()}).strict();
export const subtitleDocumentDetailSchema=z.object({document:subtitleDocumentSchema,history:editorHistoryStateSchema,media:z.object({sourceAssetId:idSchema,playbackUrl:z.string(),playbackKind:z.enum(['SOURCE','PROXY']),previewStatus:editorPreparationStatusSchema,previewMessage:z.string(),waveformStatus:editorPreparationStatusSchema,waveformMessage:z.string(),waveformUrl:z.string().nullable(),previewJob:jobSchema.nullable(),waveformJob:jobSchema.nullable()}).strict()}).strict();
export const subtitleCuePageSchema=z.object({document:subtitleDocumentSchema,items:z.array(subtitleCueSchema),total:count,offset:count,limit:z.number().int().positive()}).strict();

const base=z.object({baseRevision:count,clientOperationId:idSchema.optional()});const timing=z.object({cueId:idSchema,startMs:time,endMs:z.number().int().positive()}).strict().refine(value=>value.endMs>value.startMs,'Cue end must be after start.');
export const editorOperationRequestSchema=z.discriminatedUnion('type',[
  base.extend({type:z.literal('UPDATE_TEXT'),payload:z.object({cueId:idSchema,text:z.string().max(8000)}).strict()}).strict(),
  base.extend({type:z.literal('MOVE_CUE'),payload:timing}).strict(),base.extend({type:z.literal('RESIZE_START'),payload:timing}).strict(),base.extend({type:z.literal('RESIZE_END'),payload:timing}).strict(),
  base.extend({type:z.literal('SPLIT_CUE'),payload:z.object({cueId:idSchema,splitMs:time,caret:count.optional()}).strict()}).strict(),
  base.extend({type:z.literal('MERGE_CUES'),payload:z.object({cueIds:z.array(idSchema).min(2).max(12),separator:z.enum(['SPACE','LINE_BREAK']).default('SPACE')}).strict()}).strict(),
  base.extend({type:z.literal('DELETE_CUE'),payload:z.object({cueId:idSchema}).strict()}).strict(),
  base.extend({type:z.literal('CREATE_CUE'),payload:z.object({startMs:time,endMs:z.number().int().positive(),text:z.string().max(8000).default('')}).strict().refine(value=>value.endMs>value.startMs,'Cue end must be after start.')}).strict(),
  base.extend({type:z.literal('SET_CUE_STATUS'),payload:z.object({cueId:idSchema,status:subtitleCueStatusSchema}).strict()}).strict(),
  base.extend({type:z.literal('ACCEPT_AI_REWRITE'),payload:z.object({cueId:idSchema,proposalId:idSchema}).strict()}).strict(),
]);
export const editorRevisionRequestSchema=z.object({baseRevision:count,clientOperationId:idSchema.optional()}).strict();
export const editorOperationResultSchema=z.object({documentRevision:count,operationId:idSchema,type:editorOperationTypeSchema,cues:z.array(subtitleCueSchema),history:editorHistoryStateSchema}).strict();
export const editorRewriteRequestSchema=z.object({action:editorRewriteActionSchema,baseRevision:count}).strict();
export const editorRewriteDecisionSchema=z.object({baseRevision:count}).strict();
export const editorRewriteProposalSchema=z.object({id:idSchema,subtitleDocumentId:idSchema,subtitleCueId:idSchema,action:editorRewriteActionSchema,status:editorProposalStatusSchema,baseDocumentRevision:count,currentTextSnapshot:z.string(),proposalText:z.string(),provider:z.string(),model:z.string(),providerVersion:z.string().nullable(),confidence:z.number().min(0).max(1).nullable(),notes:z.array(localizationReasonSchema),createdAt:iso,updatedAt:iso}).strict();
export const editorPreparationRequestSchema=z.object({kind:editorPreparationKindSchema}).strict();
export const editorMediaStateSchema=z.object({mediaAssetId:idSchema,directPlayback:z.boolean(),playbackUrl:z.string(),playbackKind:z.enum(['SOURCE','PROXY']),previewStatus:editorPreparationStatusSchema,waveformStatus:editorPreparationStatusSchema,previewPreparationId:idSchema.nullable(),waveformPreparationId:idSchema.nullable()}).strict();
export const waveformSchema=z.object({version:z.literal('waveform-v1'),durationMs:time,sampleRate:z.number().int().positive(),levels:z.array(z.object({bucketMs:z.number().int().positive(),peaks:z.array(z.tuple([z.number().min(-1).max(1),z.number().min(-1).max(1)]))}).strict()).min(1)}).strict();

export type SubtitleDocumentDto=z.infer<typeof subtitleDocumentSchema>;
export type SubtitleCueDto=z.infer<typeof subtitleCueSchema>;
export type EditorOperationRequest=z.infer<typeof editorOperationRequestSchema>;
export type EditorRewriteAction=z.infer<typeof editorRewriteActionSchema>;
export type EditorRewriteProposalDto=z.infer<typeof editorRewriteProposalSchema>;
