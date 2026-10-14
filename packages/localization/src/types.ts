import type {LocalizationMode, LocalizationReason, LocalizationSettings,SeriesLocalizationProfile, CharacterDto, RelationshipDto, GlossaryEntryDto, TranslationMemoryEntryDto,ReviewCategory} from '@mongolsub/contracts';

export interface LocalizationSource {
  id:string; sequence:number; text:string; startMs:number; endMs:number; speaker:string|null;
  confidence:number; reviewCategory:ReviewCategory; reviewStatus:'UNREVIEWED'|'REVIEWED'|'APPROVED'; editRevision:number;
}
type SnapshotRecord<T> = Omit<T,'createdAt'|'updatedAt'>;
export interface LocalizationSnapshot {
  seriesId:string; episodeId:string; fusionRunId:string; sourceLanguage:'en'|'zh';
  profile:SeriesLocalizationProfile;
  characters:SnapshotRecord<CharacterDto>[]; relationships:SnapshotRecord<RelationshipDto>[];
  glossary:SnapshotRecord<GlossaryEntryDto>[]; translationMemory:SnapshotRecord<TranslationMemoryEntryDto>[];
  previousApprovedLines:{fusionRunId:string;sequence:number;text:string}[];
}
export interface LocalizationBatch {
  targets:LocalizationSource[]; contextBefore:LocalizationSource[]; contextAfter:LocalizationSource[];
  profile:SeriesLocalizationProfile; characters:LocalizationSnapshot['characters']; relationships:LocalizationSnapshot['relationships'];
  glossary:LocalizationSnapshot['glossary']; translationMemory:LocalizationSnapshot['translationMemory'];
  previousApprovedLines:LocalizationSnapshot['previousApprovedLines'];
  speakerBindings:LocalizationSettings['speakerBindings']; characterBudgetUsed:number; estimatedInputTokens:number;
}
export interface TranslationSegment {
  segmentId:string; translation:string; providerConfidence:number|null; issues:LocalizationReason[];
  alternativeTranslation:string|null; suggestedLineBreak:string|null;
}
export interface TranslationUsage {inputTokens:number|null;outputTokens:number|null;cachedTokens:number|null}
export interface TranslationInput {
  phase:'DRAFT'|'REVIEW'; mode:LocalizationMode; sourceLanguage:'en'|'zh'; batch:LocalizationBatch; drafts?:TranslationSegment[];
}
export interface TranslationResult {segments:TranslationSegment[];usage:TranslationUsage;model:string;providerVersion:string|null}
export interface TranslationProvider {
  readiness():{status:'READY'|'MISCONFIGURED'|'UNAVAILABLE';message:string;provider:string;model:string};
  localize(input:TranslationInput,signal?:AbortSignal):Promise<TranslationResult>;
}
