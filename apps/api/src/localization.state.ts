import type { ReviewStatus } from '@mongolsub/contracts';

type CurrentLocalizationState = {
  currentText: string;
  humanReviewState: ReviewStatus;
};

type ManualLocalizationPatch = {
  expectedRevision: number;
  currentText?: string;
  humanReviewState?: ReviewStatus;
};

export function manualLocalizationUpdate(
  current: CurrentLocalizationState,
  patch: ManualLocalizationPatch,
) {
  const textChanged = patch.currentText !== undefined && patch.currentText !== current.currentText;

  return {
    ...(patch.currentText === undefined ? {} : { currentText: patch.currentText }),
    ...(textChanged ? { editState: 'MANUALLY_EDITED' as const } : {}),
    humanReviewState: textChanged
      ? 'UNREVIEWED' as const
      : patch.humanReviewState ?? current.humanReviewState,
  };
}
