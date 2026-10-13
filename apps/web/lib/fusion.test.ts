import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildTranscriptPatch, eligibleFusionInput, evidenceRoleLabel, fusionInputRole, queueFusion, saveTranscript, selectedFusionId, toggleFusionInput } from './fusion';

afterEach(() => vi.unstubAllGlobals());
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('explicit fusion inputs', () => {
  it('accepts only completed evidence belonging to the selected media', () => {
    expect(eligibleFusionInput({ status: 'COMPLETED', mediaAssetId: id }, id)).toBe(true);
    expect(eligibleFusionInput({ status: 'PROCESSING', mediaAssetId: id }, id)).toBe(false);
    expect(eligibleFusionInput({ status: 'COMPLETED', mediaAssetId: other }, id)).toBe(false);
  });
  it('retains selected snapshots across pages and only removes an explicit unchecked ID', () => {
    const first = { id, method: 'ASR' };
    const second = { id: other, method: 'OCR' };
    expect(toggleFusionInput([first], second, true)).toEqual([first, second]);
    expect(toggleFusionInput([first, second], first, false)).toEqual([second]);
  });
  it('validates explicit IDs and ordered settings before making a request', () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    expect(() => queueFusion(id, { mediaAssetId: id, inputRunIds: [] })).toThrow();
    expect(() => queueFusion(id, { mediaAssetId: id, inputRunIds: [id, id] })).toThrow();
    expect(() => queueFusion(id, { mediaAssetId: id, inputRunIds: [id], settings: { review: { problemThreshold: 0.9, highThreshold: 0.8 } } })).toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('sends exact selected IDs and an intentional rerun identity', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'FUSION_FAILED', message: 'Rejected' }), { status: 409 }));
    vi.stubGlobal('fetch', fetch);
    await expect(queueFusion(id, { mediaAssetId: id, inputRunIds: [other], language: 'CHINESE', rerunKey: id })).rejects.toMatchObject({ status: 409 });
    expect(JSON.parse(fetch.mock.calls[0]?.[1].body as string)).toMatchObject({ inputRunIds: [other], language: 'CHINESE', rerunKey: id });
  });
});

describe('language and stable run selection', () => {
  it('labels Chinese or unknown evidence as timing only for English text election', () => {
    expect(fusionInputRole('zh-TW', 'ENGLISH')).toBe('Timing only');
    expect(fusionInputRole(null, 'ENGLISH')).toBe('Timing only');
    expect(fusionInputRole('en', 'ENGLISH')).toBe('Text candidate');
    expect(fusionInputRole('zh-CN', 'CHINESE')).toBe('Text candidate');
    expect(fusionInputRole('eng', 'ENGLISH')).toBe('Text candidate');
    expect(fusionInputRole('zho', 'CHINESE')).toBe('Text candidate');
    expect(fusionInputRole('zh_TW', 'CHINESE')).toBe('Text candidate');
    expect(fusionInputRole('en', 'AUTO')).toBe('Resolved when queued');
    expect(evidenceRoleLabel('TIMING_ONLY')).toBe('Timing only · no text vote');
  });
  it('pins an explicit selected ID and otherwise uses only the active ID', () => {
    expect(selectedFusionId(other, id)).toBe(other);
    expect(selectedFusionId(null, id)).toBe(id);
    expect(selectedFusionId(null, null)).toBe(null);
  });
});

describe('canonical edit boundary', () => {
  const segment = { text: 'Original', startMs: 10, endMs: 100, editRevision: 7 };
  it('sends a revision-protected edit without changing derived/source evidence or silently approving', () => {
    expect(buildTranscriptPatch(segment, { text: 'Corrected', startMs: '10', endMs: '150', reviewStatus: 'KEEP' })).toEqual({ expectedRevision: 7, text: 'Corrected', endMs: 150 });
  });
  it('permits independent explicit human approval', () => {
    expect(buildTranscriptPatch(segment, { text: 'Original', startMs: '10', endMs: '100', reviewStatus: 'APPROVED' })).toEqual({ expectedRevision: 7, reviewStatus: 'APPROVED' });
  });
  it('rejects blank, fractional and reversed timing before saving', () => {
    for (const [startMs, endMs] of [['', '100'], ['10.2', '100'], ['110', '100']] as const) {
      expect(() => buildTranscriptPatch(segment, { text: 'Original', startMs, endMs, reviewStatus: 'KEEP' })).toThrow();
    }
  });
  it('preserves a stale revision conflict for an explicit reload, without retrying an overwrite', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'REVISION_CONFLICT', message: 'The segment was edited elsewhere. Reload it.' }), { status: 409 }));
    vi.stubGlobal('fetch', fetch);
    await expect(saveTranscript({ ...segment, id }, { text: 'Updated', startMs: '10', endMs: '100', reviewStatus: 'KEEP' })).rejects.toMatchObject({ code: 'REVISION_CONFLICT', status: 409 });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetch.mock.calls[0]?.[1].body as string)).toEqual({ expectedRevision: 7, text: 'Updated' });
  });
});
