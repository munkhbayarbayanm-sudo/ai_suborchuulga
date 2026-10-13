import type { ConfidenceReasons, CoverageMetrics, EvidenceRole, FusionSettings, ReviewCategory, SegmentEvidence } from '@mongolsub/contracts';
export type Language = 'en' | 'zh';
export type Method = 'EMBEDDED_SUBTITLE' | 'ASR' | 'OCR';
export interface FusionEvidence extends SegmentEvidence { id: string; extractionRunId: string; sequence: number }
export interface FusionInput { id: string; method: Method; segments: FusionEvidence[] }
export interface EvidenceLink { sourceSegmentId: string; sourceExtractionRunId: string; role: EvidenceRole; alignmentScore: number; textSimilarity: number | null; temporalOverlap: number; contributionWeight: number | null }
export interface DerivedSegment { startMs: number; endMs: number; text: string; language: Language; speaker: string | null; confidence: number; reviewCategory: ReviewCategory; derivationType: 'DIRECT' | 'RECONCILED'; confidenceReasons: ConfidenceReasons; evidence: EvidenceLink[] }
export interface FusionResult { segments: DerivedSegment[]; metrics: CoverageMetrics; overallConfidence: number | null; timings: { alignmentMs: number; reconciliationMs: number } }
export interface FusionHooks { stage?: (label: string, progress: number) => Promise<void>; check?: () => void }
export type { FusionSettings };
