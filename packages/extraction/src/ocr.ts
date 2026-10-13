import { AppError } from '@mongolsub/domain';
import type { SegmentEvidence, SegmentMetadata } from '@mongolsub/contracts';
import type { OcrObservation } from './providers';
function comparable(text: string): string { return text.normalize('NFC').toLowerCase().replace(/[\p{P}\p{Z}\s]/gu, ''); }
function similar(a: string, b: string): boolean {
  if (a === b) return true;
  const left = [...a]; const right = [...b];
  if (Math.max(left.length, right.length) > 2000 || Math.abs(left.length - right.length) > Math.max(left.length, right.length) * 0.12) return false;
  let previous = Array.from({length:right.length + 1}, (_,i) => i);
  for (let i = 1; i <= left.length; i++) {
    const next = [i];
    for (let j = 1; j <= right.length; j++) next[j] = Math.min((next[j-1] ?? 0)+1,(previous[j] ?? 0)+1,(previous[j-1] ?? 0)+(left[i-1] === right[j-1] ? 0 : 1));
    previous = next;
  }
  return 1 - (previous[right.length] ?? 0) / Math.max(left.length, right.length, 1) >= 0.88;
}
function spatiallyClose(a: OcrObservation['box'], b: OcrObservation['box']): boolean {
  if (!a || !b) return true;
  const overlap = Math.max(0, Math.min(a[0]+a[2],b[0]+b[2])-Math.max(a[0],b[0])) * Math.max(0, Math.min(a[1]+a[3],b[1]+b[3])-Math.max(a[1],b[1]));
  return overlap / Math.max(a[2]*a[3]+b[2]*b[3]-overlap, 0.000001) >= 0.2;
}
export type OcrSegment = SegmentEvidence & { providerMetadata: Extract<SegmentMetadata,{provider:'paddleocr'}> };
export function groupOcr(observations: OcrObservation[], settings: { fps:number; minimumConfidence:number; language:string }, durationMs: number, model = 'PP-OCRv5'): OcrSegment[] {
  const step = 1000 / settings.fps; const segments: OcrSegment[] = [];
  let current: OcrObservation[] = [];
  function flush() {
    if (!current.length) return;
    const first = current[0]; const last = current.at(-1);
    if (!first || !last) return;
    const representative = current.reduce((a,b) => (b.confidence ?? -1) > (a.confidence ?? -1) ? b : a);
    const values = current.flatMap(v => v.confidence === null ? [] : [v.confidence]).sort((a,b) => a-b);
    const middle = Math.floor(values.length / 2);
    const confidence = !values.length ? null : values.length % 2 ? values[middle] ?? null : ((values[middle-1] ?? 0)+(values[middle] ?? 0))/2;
    const endMs = Math.min(durationMs, Math.round(last.timestampMs + step));
    if (endMs > first.timestampMs) segments.push({ startMs:first.timestampMs, endMs, text:representative.text.trim(), language:settings.language, confidence, speaker:null, words:[], providerMetadata:{provider:'paddleocr',model,representativeTimestampMs:representative.timestampMs,rawText:representative.text,box:representative.box,observationCount:current.length} });
    current = [];
  }
  let lastTimestamp = -1;
  for (const observation of [...observations].sort((a,b) => a.timestampMs-b.timestampMs)) {
    if (observation.timestampMs <= lastTimestamp) throw new AppError('INVALID_PROVIDER_OUTPUT', 'OCR frame timestamps must be unique.');
    lastTimestamp = observation.timestampMs;
    if (!comparable(observation.text) || (observation.confidence !== null && observation.confidence < settings.minimumConfidence)) { flush(); continue; }
    const previous = current.at(-1);
    if (previous && (observation.timestampMs - previous.timestampMs > step * 1.6 || !similar(comparable(previous.text),comparable(observation.text)) || !spatiallyClose(previous.box,observation.box))) flush();
    current.push(observation);
  }
  flush(); return segments;
}
