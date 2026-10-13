import { describe, expect, it } from 'vitest';
import { createSeriesSchema, createEpisodeSchema, updateSeriesSchema } from '../../packages/contracts/src/index';
describe('input contracts', () => {
  it.each(['en', 'zh-CN', 'zh-TW', 'ko', 'ja', 'ru'])('accepts language %s', sourceLanguage => { expect(createSeriesSchema.parse({ title: ' Drama ', sourceLanguage }).title).toBe('Drama'); });
  it.each([{ title: '' }, { title: 'x', extra: true }, { title: 'x', sourceLanguage: '../../media' }])('rejects invalid series %j', value => { expect(createSeriesSchema.safeParse(value).success).toBe(false); });
  it('allows episodes without numbering and rejects negative numbers', () => { expect(createEpisodeSchema.parse({ title: 'Pilot' })).toEqual({ title: 'Pilot' }); expect(createEpisodeSchema.safeParse({ title: 'Pilot', episodeNumber: -1 }).success).toBe(false); });
  it('rejects an empty update', () => { expect(updateSeriesSchema.safeParse({}).success).toBe(false); });
});
