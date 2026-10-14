import { describe, expect, it } from 'vitest';
import { localizationActive, progressLabel, selectedLocalizationId } from './localization';

const run = (status: string, stage: string | null = null, completedBatchCount = 0, batchCount = 0) => ({ status, stage, completedBatchCount, batchCount }) as never;

describe('localization UI helpers', () => {
  it('treats only queued and processing runs as active work', () => {
    expect(localizationActive(run('QUEUED'))).toBe(true);
    expect(localizationActive(run('PROCESSING'))).toBe(true);
    expect(localizationActive(run('FAILED'))).toBe(false);
    expect(localizationActive(run('COMPLETED'))).toBe(false);
  });

  it('keeps an explicit history choice over the active localization', () => {
    expect(selectedLocalizationId('history', 'active')).toBe('history');
    expect(selectedLocalizationId(null, 'active')).toBe('active');
  });

  it('reports bounded batch progress without claiming provider precision', () => {
    expect(progressLabel(run('PROCESSING', 'Translating', 3, 12))).toBe('Translating · batch 4 of 12');
    expect(progressLabel(run('QUEUED'))).toBe('Waiting for worker');
  });
});
