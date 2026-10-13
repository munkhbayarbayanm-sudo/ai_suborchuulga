import { describe, expect, it } from 'vitest';
import { parseProbe, runProcess, toolAvailable } from '../../packages/media/src/index';
describe('typed ffprobe parser', () => {
  it('normalizes container, duration, rational rate and all stream types', () => {
    const parsed = parseProbe({ format: { duration: '2.5', format_name: 'matroska,webm' }, streams: [
      { index: 0, codec_type: 'video', codec_name: 'h264', width: 320, height: 180, avg_frame_rate: '24000/1001' },
      { index: 1, codec_type: 'audio', codec_name: 'aac', channels: 2, sample_rate: '48000', tags: { language: 'eng', title: 'Main' } },
      { index: 2, codec_type: 'subtitle', codec_name: 'subrip' }, { index: 3, codec_type: 'data' }
    ] });
    expect(parsed.durationMs).toBe(2500);
    expect(parsed.streams.map(s => s.type)).toEqual(['VIDEO', 'AUDIO', 'SUBTITLE', 'OTHER']);
    expect(parsed.streams[0]?.frameRate).toBeCloseTo(23.976, 3);
    expect(parsed.streams[1]?.language).toBe('eng');
  });
  it('handles optional unknown duration and zero frame rate', () => {
    const result = parseProbe({ streams: [{ index: 0, codec_type: 'video', avg_frame_rate: '0/0' }] });
    expect(result.durationMs).toBeNull(); expect(result.streams[0]?.frameRate).toBeNull();
  });
  it.each([{}, { streams: 'bad' }, { streams: [{ index: '0', width: '320' }] }, { streams: [{ index: 0 }, { index: 0 }] }, { streams: [{ index: 0, width: -1 }] }])('rejects malformed payload %j', input => { expect(() => parseProbe(input)).toThrow(); });
});
describe('bounded process boundary', () => {
  it('captures exit code stdout stderr without shell interpolation', async () => {
    const result = await runProcess(process.execPath, ['-e', 'process.stdout.write(process.argv[1]);process.stderr.write("err");process.exit(7)', 'literal; $HOME'], 5000);
    expect(result).toMatchObject({ stdout: 'literal; $HOME', stderr: 'err', exitCode: 7 });
  });
  it('times out a stuck process', async () => { await expect(runProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], 50)).rejects.toMatchObject({ code: 'MEDIA_TIMEOUT' }); });
  it('rejects excessive output', async () => { await expect(runProcess(process.execPath, ['-e', 'process.stdout.write("a".repeat(10000))'], 5000, 100)).rejects.toMatchObject({ code: 'MEDIA_OUTPUT_LIMIT' }); });
  it('reports a missing executable clearly with safe developer diagnostics', async () => { expect(await toolAvailable('mongolsub-no-such-executable')).toBe(false); await expect(runProcess('mongolsub-no-such-executable', [], 500)).rejects.toMatchObject({ code: 'MEDIA_TOOL_MISSING', diagnostics: { systemCode: 'ENOENT' } }); });
});
