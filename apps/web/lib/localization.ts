import type { LocalizedSegmentDto, LocalizationRunDto, ReviewCategory } from '@mongolsub/contracts';
import { request } from './api';
import { localizedSegmentSchema } from '@mongolsub/contracts';

export type LocalizationFilter = 'ALL' | 'NEEDS_REVIEW' | 'LIKELY_PROBLEM' | 'HIGH_CONFIDENCE' | 'MANUAL' | 'APPROVED';

export const localizationFilterLabels: Record<LocalizationFilter, string> = {
  ALL: 'All lines', NEEDS_REVIEW: 'Needs review', LIKELY_PROBLEM: 'Likely problem',
  HIGH_CONFIDENCE: 'High confidence', MANUAL: 'Manually edited', APPROVED: 'Approved',
};

export const localizationReviewLabels: Record<ReviewCategory, string> = {
  HIGH_CONFIDENCE: 'High confidence', REVIEW_RECOMMENDED: 'Review recommended', LIKELY_PROBLEM: 'Likely problem',
};

export function localizationActive(run: LocalizationRunDto) {
  return run.status === 'QUEUED' || run.status === 'PROCESSING';
}

export function selectedLocalizationId(selectedId: string | null, activeId: string | null) {
  return selectedId ?? activeId;
}

export function progressLabel(run: LocalizationRunDto) {
  const stage = run.stage?.trim() || (run.status === 'QUEUED' ? 'Waiting for worker' : 'Processing localization');
  if (run.batchCount && run.status === 'PROCESSING') return `${stage} · batch ${Math.min(run.completedBatchCount + 1, run.batchCount)} of ${run.batchCount}`;
  return stage;
}

export async function saveLocalizedSegment(segment: LocalizedSegmentDto, currentText: string) {
  return request(`/localized-segments/${segment.id}`, localizedSegmentSchema, {
    method: 'PATCH', body: { expectedRevision: segment.revision, currentText: currentText.trim() },
  });
}

export async function approveLocalizedSegment(segment: LocalizedSegmentDto) {
  return request(`/localized-segments/${segment.id}/approve`, localizedSegmentSchema, {
    method: 'POST', body: { expectedRevision: segment.revision },
  });
}
