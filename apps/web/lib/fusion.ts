import { fusionRequestSchema, fusionRunSchema, transcriptDetailSchema, transcriptPatchSchema, type EvidenceRole, type FusionRunDto, type TranscriptSegmentDto } from '@mongolsub/contracts';
import { request } from './api';

export const reviewLabels = { HIGH_CONFIDENCE: 'High confidence', REVIEW_RECOMMENDED: 'Review recommended', LIKELY_PROBLEM: 'Likely problem' };
export const humanReviewLabels = { UNREVIEWED: 'Unreviewed', REVIEWED: 'Reviewed', APPROVED: 'Approved' };
export function eligibleFusionInput(run: { status: string; mediaAssetId: string }, assetId: string) { return run.status === 'COMPLETED' && run.mediaAssetId === assetId; }
export function toggleFusionInput<T extends { id: string }>(selected: T[], run: T, checked: boolean): T[] { return checked ? [...selected.filter(item => item.id !== run.id), run] : selected.filter(item => item.id !== run.id); }
export function selectedFusionId(selectedId: string | null, activeId: string | null) { return selectedId ?? activeId; }
export function fusionInputRole(language: string | null, choice: 'AUTO' | 'ENGLISH' | 'CHINESE') {
  if (choice === 'AUTO') return 'Resolved when queued';
  const tag = language?.trim().toLowerCase().replaceAll('_', '-').split('-')[0];
  const family = tag === 'eng' ? 'en' : tag === 'zho' || tag === 'chi' ? 'zh' : tag;
  return family === (choice === 'ENGLISH' ? 'en' : 'zh') ? 'Text candidate' : 'Timing only';
}
export function evidenceRoleLabel(role: EvidenceRole) { return { PRIMARY: 'Primary text', SUPPORTING: 'Supporting text', CONFLICTING: 'Conflicting text', TIMING_ONLY: 'Timing only · no text vote' }[role]; }
export function fusionActive(run: { status: string }) { return run.status === 'QUEUED' || run.status === 'PROCESSING'; }
export function queueFusion(episodeId: string, body: unknown) { const input = fusionRequestSchema.parse(body); return request(`/episodes/${encodeURIComponent(episodeId)}/fusion-runs`, fusionRunSchema, { method: 'POST', body: input }); }
export function rerunFusion(run: FusionRunDto, rerunKey: string) { return queueFusion(run.episodeId, { mediaAssetId: run.mediaAssetId, inputRunIds: run.inputs.map(input => input.id), language: run.requestedLanguage, settings: run.settings, rerunKey }); }
export interface TranscriptDraft { text: string; startMs: string; endMs: string; reviewStatus: 'KEEP' | 'UNREVIEWED' | 'REVIEWED' | 'APPROVED' }
export function buildTranscriptPatch(segment: Pick<TranscriptSegmentDto, 'text' | 'startMs' | 'endMs' | 'editRevision'>, draft: TranscriptDraft) {
  if (!draft.startMs.trim() || !draft.endMs.trim()) throw new Error('Enter both start and end in whole milliseconds.');
  const startMs = Number(draft.startMs), endMs = Number(draft.endMs);
  if (!Number.isSafeInteger(startMs) || !Number.isSafeInteger(endMs) || startMs < 0 || endMs <= startMs) throw new Error('Use whole milliseconds, with end after start.');
  const text = draft.text.trim();
  return transcriptPatchSchema.parse({ expectedRevision: segment.editRevision, ...(text === segment.text ? {} : { text }), ...(startMs === segment.startMs ? {} : { startMs }), ...(endMs === segment.endMs ? {} : { endMs }), ...(draft.reviewStatus === 'KEEP' ? {} : { reviewStatus: draft.reviewStatus }) });
}
export function saveTranscript(segment: Pick<TranscriptSegmentDto, 'id' | 'text' | 'startMs' | 'endMs' | 'editRevision'>, draft: TranscriptDraft) { const body = buildTranscriptPatch(segment, draft); return request(`/transcript-segments/${segment.id}`, transcriptDetailSchema, { method: 'PATCH', body }); }
