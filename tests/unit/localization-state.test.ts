import { expect, it } from 'vitest';
import { manualLocalizationUpdate } from '../../apps/api/src/localization.state';
it('manual text changes preserve draft and reset approval unless explicitly reviewed', () => {
  expect(manualLocalizationUpdate({ currentText: 'Нээрээ юу?', humanReviewState: 'APPROVED' }, { expectedRevision: 2, currentText: 'Арай ч дээ.' })).toMatchObject({ currentText: 'Арай ч дээ.', editState: 'MANUALLY_EDITED', humanReviewState: 'UNREVIEWED' });
  expect(manualLocalizationUpdate({ currentText: 'Нээрээ юу?', humanReviewState: 'UNREVIEWED' }, { expectedRevision: 2, humanReviewState: 'APPROVED' })).not.toHaveProperty('machineDraft');
});
