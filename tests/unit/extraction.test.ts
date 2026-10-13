import { describe, expect, it } from 'vitest';
import { parseSubtitles, groupOcr, normalizedLanguage, extractionIdentity, parseAsrResult } from '../../packages/extraction/src/index';
describe('independent source normalization', () => {
  it('parses SRT milliseconds, line breaks, UTF8 and rendering tags', () => {
    const result = parseSubtitles('\ufeff1\r\n00:00:01,200 --> 00:00:02,500\r\n{\\an8}<i>Hello</i> &amp; welcome\r\n你好吗\r\n\r\n2\r\n00:00:03.000 --> 00:00:04.000\r\n再見\r\n', 'zh');
    expect(result).toHaveLength(2); expect(result[0]).toMatchObject({ startMs: 1200, endMs: 2500, text: 'Hello & welcome\n你好吗', language: 'zh' });
  });
  it('rejects invalid timing instead of silently losing text', () => { expect(() => parseSubtitles('1\n00:00:02,000 --> 00:00:01,000\nHello', 'en')).toThrow(); });
  it('groups OCR repetition and punctuation noise with median returned confidence', () => {
    const result = groupOcr([1000,1250,1500,1750,2500,2750].map((timestampMs,i) => ({ timestampMs, text: i < 4 ? i === 2 ? 'Hello.' : 'Hello' : 'Where are you?', confidence: [0.96,0.97,0.94,0.96,0.95,0.96][i] ?? null, box: null })), { fps: 4, minimumConfidence: 0.5, language: 'en' }, 4000);
    expect(result).toHaveLength(2); expect(result[0]).toMatchObject({ startMs: 1000, endMs: 2000, confidence: 0.96, text: 'Hello' });
  });
  it('breaks repetition at blank frames/gaps, preserves original text and unknown confidence', () => {
    const result = groupOcr([{timestampMs:0,text:'我不會走',confidence:null,box:null},{timestampMs:250,text:'',confidence:null,box:null},{timestampMs:500,text:'我不會走',confidence:null,box:null},{timestampMs:2000,text:'我不会走',confidence:0.2,box:null}], {fps:4,minimumConfidence:0.5,language:'zh-TW'}, 3000);
    expect(result).toHaveLength(2); expect(result[0]?.text).toBe('我不會走'); expect(result[0]?.confidence).toBeNull();
  });
  it('keeps Chinese speech generic and preserves declared script tags', () => {
    expect(normalizedLanguage('eng')).toBe('en'); expect(normalizedLanguage('chi')).toBe('zh'); expect(normalizedLanguage('zh-Hant')).toBe('zh-TW'); expect(normalizedLanguage('und')).toBeNull();
  });
  it('uses deterministic request identity and explicit revisions', () => {
    const settings = { method: 'ASR' as const, streamIndex: 1, language: 'en' as const, align: true, diarize: false };
    expect(extractionIdentity('asset', settings, 'whisperx', '3', 'base', 'default')).toBe(extractionIdentity('asset', settings, 'whisperx', '3', 'base', 'default'));
    expect(extractionIdentity('asset', settings, 'whisperx', '3', 'base', 'rerun')).not.toBe(extractionIdentity('asset', settings, 'whisperx', '3', 'base', 'default'));
  });
  it('validates ASR timings, words and language conservatively', () => {
    expect(() => parseAsrResult({provider:'whisperx',providerVersion:'3',modelVersion:'base',languageDetected:'zh-CN',device:'cpu',segments:[],warnings:[]})).toThrow();
    const result = parseAsrResult({provider:'whisperx',providerVersion:'3',modelVersion:'base',languageDetected:'zh',device:'cpu',segments:[{startMs:100,endMs:1000,text:'你好',language:'zh',confidence:null,speaker:null,words:[{text:'你好',startMs:null,endMs:null,confidence:null,speaker:null}]}],warnings:[]});
    expect(result.segments[0]?.words[0]?.startMs).toBeNull();
  });
  it('rejects words outside their segment and out-of-order timed words', () => {
    const word=(startMs:number,endMs:number)=>({text:'word',startMs,endMs,confidence:null,speaker:null});
    const result=(words:ReturnType<typeof word>[])=>({provider:'whisperx',providerVersion:'3',modelVersion:'base',languageDetected:'en',device:'cpu',segments:[{startMs:100,endMs:1000,text:'words',language:'en',confidence:null,speaker:null,words}],warnings:[]});
    expect(()=>parseAsrResult(result([word(5000,6000)]))).toThrow();
    expect(()=>parseAsrResult(result([word(500,600),word(200,300)]))).toThrow();
  });
});
