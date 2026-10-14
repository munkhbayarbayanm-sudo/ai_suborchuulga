import {z} from 'zod';
import {idSchema,jobSchema} from './common';

const ms=z.number().int().nonnegative();const positiveMs=z.number().int().positive();const unit=z.number().min(0).max(1);const iso=z.string().datetime();
export const videoProjectStatusSchema=z.enum(['READY','ARCHIVED']);
export const videoTrackTypeSchema=z.enum(['VIDEO','AUDIO','IMAGE','TEXT','SUBTITLE','EFFECT']);
export const projectAssetKindSchema=z.enum(['VIDEO','AUDIO','IMAGE']);
export const projectAssetStatusSchema=z.enum(['IMPORTED','INSPECTING','READY','FAILED']);
export const projectAssetWaveformStatusSchema=z.enum(['MISSING','QUEUED','PROCESSING','COMPLETED','FAILED','CANCELLED']);
export const projectFitModeSchema=z.enum(['FIT','FILL','STRETCH']);
export const visualOverlayTypeSchema=z.enum(['IMAGE','TEXT','BLUR']);
export const videoOperationTypeSchema=z.enum(['SPLIT_CLIP','TRIM_CLIP_START','TRIM_CLIP_END','MOVE_CLIP','DELETE_CLIP','SET_LINKED','UPDATE_CLIP','CREATE_CLIP','CREATE_OVERLAY','UPDATE_OVERLAY','DELETE_OVERLAY','UPDATE_TRACK','UPDATE_PROJECT','UNDO','REDO']);
export const canvasPresetSchema=z.enum(['ORIGINAL','16:9','9:16','1:1','4:5']);
export const createVideoProjectSchema=z.object({name:z.string().trim().min(1).max(200).default('Video project'),canvasPreset:canvasPresetSchema.default('ORIGINAL'),activeSubtitleDocumentId:idSchema.nullable().optional(),initializationKey:idSchema.optional()}).strict();
export const videoProjectQuerySchema=z.object({offset:z.coerce.number().int().min(0).max(1_000_000).default(0),limit:z.coerce.number().int().min(1).max(100).default(25)}).strict();
export const videoProjectTimelineQuerySchema=z.object({startMs:z.coerce.number().int().nonnegative().default(0),endMs:z.coerce.number().int().positive().optional()}).strict().refine(value=>value.endMs===undefined||value.endMs>value.startMs,'Window end must be after start.');
export const videoTrackSchema=z.object({id:idSchema,projectId:idSchema,type:videoTrackTypeSchema,name:z.string(),order:z.number().int(),locked:z.boolean(),hidden:z.boolean(),muted:z.boolean(),solo:z.boolean()}).strict();
export const projectAssetSchema=z.object({id:idSchema,projectId:idSchema,mediaAssetId:idSchema,name:z.string(),kind:projectAssetKindSchema,mimeType:z.string(),status:projectAssetStatusSchema,durationMs:ms.nullable(),width:z.number().int().positive().nullable(),height:z.number().int().positive().nullable(),playbackUrl:z.string(),waveformStatus:projectAssetWaveformStatusSchema,waveformUrl:z.string().nullable(),createdAt:iso}).strict();
const clipTransform={fitMode:projectFitModeSchema,positionX:unit,positionY:unit,scaleX:z.number().min(0.05).max(20),scaleY:z.number().min(0.05).max(20),rotationDeg:z.number().min(-360).max(360),opacity:unit,cropX:unit,cropY:unit,cropWidth:z.number().min(0.001).max(1),cropHeight:z.number().min(0.001).max(1),brightness:z.number().min(0).max(3),contrast:z.number().min(0).max(3),saturation:z.number().min(0).max(3),volume:z.number().min(0).max(2),muted:z.boolean(),fadeInMs:ms,fadeOutMs:ms};
export const projectClipSchema=z.object({id:idSchema,projectId:idSchema,trackId:idSchema,projectAssetId:idSchema,originClipId:idSchema.nullable(),linkGroupId:idSchema.nullable(),timelineStartMs:ms,sourceInMs:ms,sourceOutMs:positiveMs,playbackRate:z.number().min(.25).max(4),...clipTransform}).strict().refine(value=>value.sourceOutMs>value.sourceInMs,'Source out must be after source in.').refine(value=>value.cropX+value.cropWidth<=1&&value.cropY+value.cropHeight<=1,'Crop exceeds source bounds.');
export const visualOverlaySchema=z.object({id:idSchema,projectId:idSchema,trackId:idSchema,projectAssetId:idSchema.nullable(),type:visualOverlayTypeSchema,timelineStartMs:ms,timelineEndMs:positiveMs,positionX:unit,positionY:unit,width:z.number().min(.001).max(1),height:z.number().min(.001).max(1),rotationDeg:z.number().min(-360).max(360),opacity:unit,text:z.string().max(8000).nullable(),fontFamily:z.enum(['Inter','Arial','Georgia','Courier New']).nullable(),fontSize:z.number().min(8).max(300).nullable(),fontWeight:z.number().int().min(100).max(900).nullable(),textColor:z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),alignment:z.enum(['LEFT','CENTER','RIGHT']).nullable(),blurStrength:z.number().min(0).max(50).nullable()}).strict().refine(value=>value.timelineEndMs>value.timelineStartMs,'Overlay end must be after start.');
export const mappedProjectSubtitleSchema=z.object({sourceCueId:idSchema,sourceClipId:idSchema,startMs:ms,endMs:positiveMs,text:z.string(),partiallyCut:z.boolean()}).strict();
export const videoProjectSchema=z.object({id:idSchema,episodeId:idSchema,name:z.string(),status:videoProjectStatusSchema,revision:z.number().int().nonnegative(),canvasWidth:z.number().int().positive(),canvasHeight:z.number().int().positive(),frameRate:z.number().positive(),background:z.string().regex(/^#[0-9a-fA-F]{6}$/),activeSubtitleDocumentId:idSchema.nullable(),isActive:z.boolean(),durationMs:ms,createdAt:iso,updatedAt:iso}).strict();
export const videoProjectPageSchema=z.object({items:z.array(videoProjectSchema),total:z.number().int().nonnegative(),offset:z.number().int().nonnegative(),limit:z.number().int().positive(),activeProjectId:idSchema.nullable()}).strict();
export const videoProjectHistorySchema=z.object({canUndo:z.boolean(),canRedo:z.boolean(),undoOperationId:idSchema.nullable(),redoOperationId:idSchema.nullable()}).strict();
export const videoProjectDetailSchema=z.object({project:videoProjectSchema,tracks:z.array(videoTrackSchema),assets:z.array(projectAssetSchema),clips:z.array(projectClipSchema),overlays:z.array(visualOverlaySchema),subtitles:z.array(mappedProjectSubtitleSchema),partialSubtitleCutCount:z.number().int().nonnegative(),history:videoProjectHistorySchema,qc:z.object({subtitleDocumentRevision:z.number().int().nonnegative().nullable(),latestRunStatus:z.enum(['QUEUED','PROCESSING','COMPLETED','FAILED','CANCELLED','STALE']).nullable(),openIssueCount:z.number().int().nonnegative()}).strict()}).strict();

const base=z.object({baseRevision:z.number().int().nonnegative(),clientOperationId:idSchema.optional()});const clipId=z.object({clipId:idSchema}).strict();
const updateClipChanges=z.object(clipTransform).partial().extend({linkGroupId:idSchema.nullable().optional()}).strict().refine(value=>value.cropX===undefined||value.cropWidth===undefined||value.cropX+value.cropWidth<=1,'Crop exceeds source bounds.').refine(value=>value.cropY===undefined||value.cropHeight===undefined||value.cropY+value.cropHeight<=1,'Crop exceeds source bounds.');
const createClipPayload=z.object({trackId:idSchema,projectAssetId:idSchema,timelineStartMs:ms,sourceInMs:ms,sourceOutMs:positiveMs,playbackRate:z.number().min(.25).max(4).default(1),linkGroupId:idSchema.nullable().optional()}).strict().refine(value=>value.sourceOutMs>value.sourceInMs,'Source out must be after source in.');
const overlayBase=z.object({trackId:idSchema,projectAssetId:idSchema.nullable().optional(),overlayType:visualOverlayTypeSchema,timelineStartMs:ms,timelineEndMs:positiveMs,positionX:unit.default(.5),positionY:unit.default(.5),width:z.number().min(.001).max(1).default(.25),height:z.number().min(.001).max(1).default(.15),rotationDeg:z.number().min(-360).max(360).default(0),opacity:unit.default(1),text:z.string().max(8000).nullable().optional(),fontFamily:z.enum(['Inter','Arial','Georgia','Courier New']).nullable().optional(),fontSize:z.number().min(8).max(300).nullable().optional(),fontWeight:z.number().int().min(100).max(900).nullable().optional(),textColor:z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),alignment:z.enum(['LEFT','CENTER','RIGHT']).nullable().optional(),blurStrength:z.number().min(0).max(50).nullable().optional()}).strict();
const overlayFields=overlayBase.refine(value=>value.timelineEndMs>value.timelineStartMs,'Overlay end must be after start.');
export const videoOperationRequestSchema=z.discriminatedUnion('type',[
  base.extend({type:z.literal('SPLIT_CLIP'),payload:clipId.extend({projectTimeMs:ms})}).strict(),
  base.extend({type:z.literal('TRIM_CLIP_START'),payload:clipId.extend({projectTimeMs:ms})}).strict(),
  base.extend({type:z.literal('TRIM_CLIP_END'),payload:clipId.extend({projectTimeMs:ms})}).strict(),
  base.extend({type:z.literal('MOVE_CLIP'),payload:clipId.extend({timelineStartMs:ms})}).strict(),
  base.extend({type:z.literal('DELETE_CLIP'),payload:clipId}).strict(),
  base.extend({type:z.literal('SET_LINKED'),payload:clipId.extend({linked:z.boolean(),linkGroupId:idSchema.optional()})}).strict(),
  base.extend({type:z.literal('UPDATE_CLIP'),payload:clipId.extend({changes:updateClipChanges})}).strict(),
  base.extend({type:z.literal('CREATE_CLIP'),payload:createClipPayload}).strict(),
  base.extend({type:z.literal('CREATE_OVERLAY'),payload:overlayFields}).strict(),
  base.extend({type:z.literal('UPDATE_OVERLAY'),payload:z.object({overlayId:idSchema,changes:overlayBase.omit({trackId:true,overlayType:true}).partial()}).strict()}).strict(),
  base.extend({type:z.literal('DELETE_OVERLAY'),payload:z.object({overlayId:idSchema}).strict()}).strict(),
  base.extend({type:z.literal('UPDATE_TRACK'),payload:z.object({trackId:idSchema,changes:z.object({locked:z.boolean().optional(),hidden:z.boolean().optional(),muted:z.boolean().optional(),solo:z.boolean().optional(),order:z.number().int().optional()}).strict()}).strict()}).strict(),
  base.extend({type:z.literal('UPDATE_PROJECT'),payload:z.object({canvasPreset:canvasPresetSchema.optional(),background:z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),activeSubtitleDocumentId:idSchema.nullable().optional()}).strict()}).strict(),
]);
export const videoProjectRevisionRequestSchema=z.object({baseRevision:z.number().int().nonnegative(),clientOperationId:idSchema.optional()}).strict();
export const videoOperationResultSchema=z.object({projectRevision:z.number().int().nonnegative(),operationId:idSchema,type:videoOperationTypeSchema,project:videoProjectDetailSchema,history:videoProjectHistorySchema}).strict();
export const projectAssetReferenceSchema=z.object({mediaAssetId:idSchema,name:z.string().trim().min(1).max(240).optional(),kind:projectAssetKindSchema.optional()}).strict();
export const projectAssetImportResultSchema=z.object({asset:projectAssetSchema,job:jobSchema.nullable()}).strict();

export type VideoProjectDto=z.infer<typeof videoProjectSchema>;
export type VideoProjectDetailDto=z.infer<typeof videoProjectDetailSchema>;
export type ProjectClipDto=z.infer<typeof projectClipSchema>;
export type VisualOverlayDto=z.infer<typeof visualOverlaySchema>;
export type VideoOperationRequest=z.infer<typeof videoOperationRequestSchema>;
