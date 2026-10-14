-- CreateEnum
CREATE TYPE "LocalizationMode" AS ENUM ('STRICT', 'NATURAL', 'CINEMATIC');

-- CreateEnum
CREATE TYPE "LocalizationEditState" AS ENUM ('PENDING', 'AI_GENERATED', 'AI_REVISED', 'MANUALLY_EDITED');

-- CreateEnum
CREATE TYPE "GlossaryScope" AS ENUM ('GLOBAL', 'SERIES', 'EPISODE', 'CHARACTER');

-- CreateEnum
CREATE TYPE "MemoryStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TranslationMemoryOrigin" AS ENUM ('HUMAN_APPROVED', 'IMPORTED', 'AI_SUGGESTED');

-- CreateEnum
CREATE TYPE "TranslationMemoryStatus" AS ENUM ('TRUSTED', 'SUGGESTED', 'ARCHIVED');

-- AlterEnum
ALTER TYPE "JobType" ADD VALUE 'LOCALIZE_TRANSCRIPT';

-- AlterTable
ALTER TABLE "Episode" ADD COLUMN     "activeLocalizationRunId" UUID;

-- CreateTable
CREATE TABLE "SeriesLocalizationProfile" (
    "seriesId" UUID NOT NULL,
    "defaultMode" "LocalizationMode" NOT NULL DEFAULT 'NATURAL',
    "generalTone" TEXT NOT NULL DEFAULT '',
    "setting" TEXT NOT NULL DEFAULT '',
    "preferredStyle" TEXT NOT NULL DEFAULT '',
    "formalityGuidance" TEXT NOT NULL DEFAULT '',
    "nameHandling" TEXT NOT NULL DEFAULT '',
    "specialNotes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeriesLocalizationProfile_pkey" PRIMARY KEY ("seriesId")
);

-- CreateTable
CREATE TABLE "Character" (
    "id" UUID NOT NULL,
    "seriesId" UUID NOT NULL,
    "canonicalName" VARCHAR(200) NOT NULL,
    "sourceName" VARCHAR(500) NOT NULL,
    "mongolianName" VARCHAR(500),
    "role" VARCHAR(500),
    "title" VARCHAR(500),
    "speakingStyle" TEXT,
    "formality" VARCHAR(500),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Character_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterAlias" (
    "id" UUID NOT NULL,
    "characterId" UUID NOT NULL,
    "alias" VARCHAR(200) NOT NULL,

    CONSTRAINT "CharacterAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterRelationship" (
    "id" UUID NOT NULL,
    "seriesId" UUID NOT NULL,
    "fromCharacterId" UUID NOT NULL,
    "toCharacterId" UUID NOT NULL,
    "type" VARCHAR(200) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlossaryEntry" (
    "id" UUID NOT NULL,
    "scope" "GlossaryScope" NOT NULL,
    "seriesId" UUID,
    "episodeId" UUID,
    "characterId" UUID,
    "sourceLanguage" VARCHAR(2) NOT NULL,
    "sourceTerm" VARCHAR(500) NOT NULL,
    "preferredMongolian" VARCHAR(1000) NOT NULL,
    "notes" TEXT,
    "caseSensitive" BOOLEAN NOT NULL DEFAULT false,
    "status" "MemoryStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlossaryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranslationMemoryEntry" (
    "id" UUID NOT NULL,
    "seriesId" UUID NOT NULL,
    "sourceLanguage" VARCHAR(2) NOT NULL,
    "sourceText" TEXT NOT NULL,
    "normalizedSourceText" TEXT NOT NULL,
    "normalizedSourceHash" VARCHAR(64) NOT NULL,
    "mongolianText" TEXT NOT NULL,
    "characterId" UUID,
    "origin" "TranslationMemoryOrigin" NOT NULL,
    "status" "TranslationMemoryStatus" NOT NULL,
    "identityHash" VARCHAR(64) NOT NULL,
    "sourceLocalizedSegmentId" UUID,
    "sourceRevision" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TranslationMemoryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalizationRun" (
    "id" UUID NOT NULL,
    "episodeId" UUID NOT NULL,
    "fusionRunId" UUID NOT NULL,
    "sourceLanguage" VARCHAR(2) NOT NULL,
    "targetLanguage" VARCHAR(2) NOT NULL DEFAULT 'mn',
    "mode" "LocalizationMode" NOT NULL,
    "provider" VARCHAR(80) NOT NULL,
    "model" VARCHAR(120) NOT NULL,
    "providerVersion" VARCHAR(120),
    "promptVersion" VARCHAR(80) NOT NULL,
    "pipelineVersion" VARCHAR(80) NOT NULL,
    "settings" JSONB NOT NULL,
    "contextSnapshot" JSONB NOT NULL,
    "sourceSnapshotHash" VARCHAR(64) NOT NULL,
    "identityHash" VARCHAR(64) NOT NULL,
    "revision" VARCHAR(36) NOT NULL DEFAULT 'default',
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "stage" TEXT,
    "processingJobId" UUID NOT NULL,
    "segmentCount" INTEGER NOT NULL,
    "completedSegmentCount" INTEGER NOT NULL DEFAULT 0,
    "highConfidenceCount" INTEGER NOT NULL DEFAULT 0,
    "reviewRecommendedCount" INTEGER NOT NULL DEFAULT 0,
    "likelyProblemCount" INTEGER NOT NULL DEFAULT 0,
    "batchCount" INTEGER NOT NULL,
    "completedBatchCount" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "cachedTokens" INTEGER,
    "usageComplete" BOOLEAN NOT NULL DEFAULT false,
    "estimatedCost" DOUBLE PRECISION,
    "processingDurationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocalizationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalizationBatch" (
    "id" UUID NOT NULL,
    "localizationRunId" UUID NOT NULL,
    "batchIndex" INTEGER NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "targetSegmentIds" JSONB NOT NULL,
    "draftResults" JSONB,
    "draftUsage" JSONB,
    "reviewUsage" JSONB,
    "errorCode" TEXT,
    "processingDurationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocalizationBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalizedSegment" (
    "id" UUID NOT NULL,
    "localizationRunId" UUID NOT NULL,
    "fusionRunId" UUID NOT NULL,
    "transcriptSegmentId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "sourceTextSnapshot" TEXT NOT NULL,
    "sourceStartMs" INTEGER NOT NULL,
    "sourceEndMs" INTEGER NOT NULL,
    "sourceConfidence" DOUBLE PRECISION NOT NULL,
    "sourceReviewCategory" "ReviewCategory" NOT NULL,
    "sourceReviewStatus" "ReviewStatus" NOT NULL,
    "sourceEditRevision" INTEGER NOT NULL,
    "sourceSpeaker" VARCHAR(100),
    "machineDraft" TEXT,
    "currentText" TEXT,
    "providerConfidence" DOUBLE PRECISION,
    "confidence" DOUBLE PRECISION,
    "confidenceReasons" JSONB NOT NULL DEFAULT '[]',
    "reviewClassification" "ReviewCategory",
    "editState" "LocalizationEditState" NOT NULL DEFAULT 'PENDING',
    "humanReviewState" "ReviewStatus" NOT NULL DEFAULT 'UNREVIEWED',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "characterCount" INTEGER,
    "readingLoad" DOUBLE PRECISION,
    "alternativeTranslation" TEXT,
    "suggestedLineBreak" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocalizedSegment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Character_seriesId_canonicalName_idx" ON "Character"("seriesId", "canonicalName");

-- CreateIndex
CREATE UNIQUE INDEX "Character_id_seriesId_key" ON "Character"("id", "seriesId");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterAlias_characterId_alias_key" ON "CharacterAlias"("characterId", "alias");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterRelationship_seriesId_fromCharacterId_toCharacterI_key" ON "CharacterRelationship"("seriesId", "fromCharacterId", "toCharacterId", "type");

-- CreateIndex
CREATE INDEX "GlossaryEntry_seriesId_sourceLanguage_sourceTerm_idx" ON "GlossaryEntry"("seriesId", "sourceLanguage", "sourceTerm");

-- CreateIndex
CREATE INDEX "GlossaryEntry_scope_status_idx" ON "GlossaryEntry"("scope", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TranslationMemoryEntry_identityHash_key" ON "TranslationMemoryEntry"("identityHash");

-- CreateIndex
CREATE INDEX "TranslationMemoryEntry_seriesId_sourceLanguage_idx" ON "TranslationMemoryEntry"("seriesId", "sourceLanguage");

-- CreateIndex
CREATE INDEX "TranslationMemoryEntry_seriesId_sourceLanguage_normalizedSo_idx" ON "TranslationMemoryEntry"("seriesId", "sourceLanguage", "normalizedSourceHash");

-- CreateIndex
CREATE INDEX "TranslationMemoryEntry_sourceLocalizedSegmentId_idx" ON "TranslationMemoryEntry"("sourceLocalizedSegmentId");

-- CreateIndex
CREATE UNIQUE INDEX "LocalizationRun_identityHash_key" ON "LocalizationRun"("identityHash");

-- CreateIndex
CREATE UNIQUE INDEX "LocalizationRun_processingJobId_key" ON "LocalizationRun"("processingJobId");

-- CreateIndex
CREATE INDEX "LocalizationRun_episodeId_createdAt_idx" ON "LocalizationRun"("episodeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LocalizationRun_id_episodeId_key" ON "LocalizationRun"("id", "episodeId");

-- CreateIndex
CREATE UNIQUE INDEX "LocalizationRun_id_fusionRunId_key" ON "LocalizationRun"("id", "fusionRunId");

-- CreateIndex
CREATE UNIQUE INDEX "LocalizationBatch_localizationRunId_batchIndex_key" ON "LocalizationBatch"("localizationRunId", "batchIndex");

-- CreateIndex
CREATE INDEX "LocalizedSegment_localizationRunId_reviewClassification_seq_idx" ON "LocalizedSegment"("localizationRunId", "reviewClassification", "sequence");

-- CreateIndex
CREATE INDEX "LocalizedSegment_localizationRunId_humanReviewState_sequenc_idx" ON "LocalizedSegment"("localizationRunId", "humanReviewState", "sequence");

-- CreateIndex
CREATE INDEX "LocalizedSegment_localizationRunId_editState_sequence_idx" ON "LocalizedSegment"("localizationRunId", "editState", "sequence");

-- CreateIndex
CREATE INDEX "LocalizedSegment_transcriptSegmentId_idx" ON "LocalizedSegment"("transcriptSegmentId");

-- CreateIndex
CREATE UNIQUE INDEX "LocalizedSegment_localizationRunId_transcriptSegmentId_key" ON "LocalizedSegment"("localizationRunId", "transcriptSegmentId");

-- CreateIndex
CREATE UNIQUE INDEX "LocalizedSegment_localizationRunId_sequence_key" ON "LocalizedSegment"("localizationRunId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "Episode_id_seriesId_key" ON "Episode"("id", "seriesId");

-- AddForeignKey
ALTER TABLE "Episode" ADD CONSTRAINT "Episode_activeLocalizationRunId_id_fkey" FOREIGN KEY ("activeLocalizationRunId", "id") REFERENCES "LocalizationRun"("id", "episodeId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeriesLocalizationProfile" ADD CONSTRAINT "SeriesLocalizationProfile_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Character" ADD CONSTRAINT "Character_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterAlias" ADD CONSTRAINT "CharacterAlias_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterRelationship" ADD CONSTRAINT "CharacterRelationship_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterRelationship" ADD CONSTRAINT "CharacterRelationship_fromCharacterId_seriesId_fkey" FOREIGN KEY ("fromCharacterId", "seriesId") REFERENCES "Character"("id", "seriesId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterRelationship" ADD CONSTRAINT "CharacterRelationship_toCharacterId_seriesId_fkey" FOREIGN KEY ("toCharacterId", "seriesId") REFERENCES "Character"("id", "seriesId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GlossaryEntry" ADD CONSTRAINT "GlossaryEntry_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GlossaryEntry" ADD CONSTRAINT "GlossaryEntry_episodeId_seriesId_fkey" FOREIGN KEY ("episodeId", "seriesId") REFERENCES "Episode"("id", "seriesId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GlossaryEntry" ADD CONSTRAINT "GlossaryEntry_characterId_seriesId_fkey" FOREIGN KEY ("characterId", "seriesId") REFERENCES "Character"("id", "seriesId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranslationMemoryEntry" ADD CONSTRAINT "TranslationMemoryEntry_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranslationMemoryEntry" ADD CONSTRAINT "TranslationMemoryEntry_characterId_seriesId_fkey" FOREIGN KEY ("characterId", "seriesId") REFERENCES "Character"("id", "seriesId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranslationMemoryEntry" ADD CONSTRAINT "TranslationMemoryEntry_sourceLocalizedSegmentId_fkey" FOREIGN KEY ("sourceLocalizedSegmentId") REFERENCES "LocalizedSegment"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalizationRun" ADD CONSTRAINT "LocalizationRun_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalizationRun" ADD CONSTRAINT "LocalizationRun_fusionRunId_episodeId_fkey" FOREIGN KEY ("fusionRunId", "episodeId") REFERENCES "FusionRun"("id", "episodeId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalizationRun" ADD CONSTRAINT "LocalizationRun_processingJobId_fkey" FOREIGN KEY ("processingJobId") REFERENCES "ProcessingJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalizationBatch" ADD CONSTRAINT "LocalizationBatch_localizationRunId_fkey" FOREIGN KEY ("localizationRunId") REFERENCES "LocalizationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalizedSegment" ADD CONSTRAINT "LocalizedSegment_localizationRunId_fusionRunId_fkey" FOREIGN KEY ("localizationRunId", "fusionRunId") REFERENCES "LocalizationRun"("id", "fusionRunId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalizedSegment" ADD CONSTRAINT "LocalizedSegment_transcriptSegmentId_fusionRunId_fkey" FOREIGN KEY ("transcriptSegmentId", "fusionRunId") REFERENCES "TranscriptSegment"("id", "fusionRunId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- Preserve parent cleanup and historical provenance through the intentional cycles.
ALTER TABLE "Episode" ALTER CONSTRAINT "Episode_activeLocalizationRunId_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "TranslationMemoryEntry" ALTER CONSTRAINT "TranslationMemoryEntry_characterId_seriesId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "TranslationMemoryEntry" ALTER CONSTRAINT "TranslationMemoryEntry_sourceLocalizedSegmentId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "LocalizationRun" ALTER CONSTRAINT "LocalizationRun_fusionRunId_episodeId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "LocalizedSegment" ALTER CONSTRAINT "LocalizedSegment_transcriptSegmentId_fusionRunId_fkey" DEFERRABLE INITIALLY DEFERRED;

-- Domain invariants that must hold even outside the application boundary.
ALTER TABLE "Character" ADD CONSTRAINT "Character_names_nonempty_check"
  CHECK (btrim("canonicalName") <> '' AND btrim("sourceName") <> '');
ALTER TABLE "CharacterRelationship" ADD CONSTRAINT "CharacterRelationship_distinct_characters_check"
  CHECK ("fromCharacterId" <> "toCharacterId" AND btrim("type") <> '');
ALTER TABLE "GlossaryEntry" ADD CONSTRAINT "GlossaryEntry_language_check"
  CHECK ("sourceLanguage" IN ('en', 'zh'));
ALTER TABLE "GlossaryEntry" ADD CONSTRAINT "GlossaryEntry_text_nonempty_check"
  CHECK (btrim("sourceTerm") <> '' AND btrim("preferredMongolian") <> '');
ALTER TABLE "GlossaryEntry" ADD CONSTRAINT "GlossaryEntry_scope_owners_check"
  CHECK (
    ("scope" = 'GLOBAL' AND "seriesId" IS NULL AND "episodeId" IS NULL AND "characterId" IS NULL) OR
    ("scope" = 'SERIES' AND "seriesId" IS NOT NULL AND "episodeId" IS NULL AND "characterId" IS NULL) OR
    ("scope" = 'EPISODE' AND "seriesId" IS NOT NULL AND "episodeId" IS NOT NULL AND "characterId" IS NULL) OR
    ("scope" = 'CHARACTER' AND "seriesId" IS NOT NULL AND "episodeId" IS NULL AND "characterId" IS NOT NULL)
  );
ALTER TABLE "TranslationMemoryEntry" ADD CONSTRAINT "TranslationMemoryEntry_language_check"
  CHECK ("sourceLanguage" IN ('en', 'zh'));
ALTER TABLE "TranslationMemoryEntry" ADD CONSTRAINT "TranslationMemoryEntry_text_nonempty_check"
  CHECK (btrim("sourceText") <> '' AND btrim("normalizedSourceText") <> '' AND btrim("mongolianText") <> '');
ALTER TABLE "TranslationMemoryEntry" ADD CONSTRAINT "TranslationMemoryEntry_hash_check"
  CHECK ("identityHash" ~ '^[0-9a-f]{64}$' AND "normalizedSourceHash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "TranslationMemoryEntry" ADD CONSTRAINT "TranslationMemoryEntry_source_pair_check"
  CHECK (("sourceLocalizedSegmentId" IS NULL) = ("sourceRevision" IS NULL));
ALTER TABLE "TranslationMemoryEntry" ADD CONSTRAINT "TranslationMemoryEntry_origin_check"
  CHECK (
    ("origin" <> 'HUMAN_APPROVED' OR ("sourceLocalizedSegmentId" IS NOT NULL AND "sourceRevision" >= 0 AND "status" = 'TRUSTED')) AND
    ("origin" <> 'AI_SUGGESTED' OR "status" <> 'TRUSTED')
  );
ALTER TABLE "LocalizationRun" ADD CONSTRAINT "LocalizationRun_languages_check"
  CHECK ("sourceLanguage" IN ('en', 'zh') AND "targetLanguage" = 'mn');
ALTER TABLE "LocalizationRun" ADD CONSTRAINT "LocalizationRun_provider_nonempty_check"
  CHECK (btrim("provider") <> '' AND btrim("model") <> '' AND btrim("promptVersion") <> '' AND btrim("pipelineVersion") <> '');
ALTER TABLE "LocalizationRun" ADD CONSTRAINT "LocalizationRun_hash_check"
  CHECK ("sourceSnapshotHash" ~ '^[0-9a-f]{64}$' AND "identityHash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "LocalizationRun" ADD CONSTRAINT "LocalizationRun_counts_check"
  CHECK (
    "segmentCount" >= 0 AND "completedSegmentCount" BETWEEN 0 AND "segmentCount" AND
    "highConfidenceCount" >= 0 AND "reviewRecommendedCount" >= 0 AND "likelyProblemCount" >= 0 AND
    "highConfidenceCount" + "reviewRecommendedCount" + "likelyProblemCount" <= "completedSegmentCount" AND
    "batchCount" >= 0 AND "completedBatchCount" BETWEEN 0 AND "batchCount" AND
    ("inputTokens" IS NULL OR "inputTokens" >= 0) AND
    ("outputTokens" IS NULL OR "outputTokens" >= 0) AND
    ("cachedTokens" IS NULL OR "cachedTokens" >= 0) AND
    ("estimatedCost" IS NULL OR "estimatedCost" >= 0) AND
    ("processingDurationMs" IS NULL OR "processingDurationMs" >= 0)
  );
ALTER TABLE "LocalizationRun" ADD CONSTRAINT "LocalizationRun_completed_check"
  CHECK ("status" <> 'COMPLETED' OR ("completedSegmentCount" = "segmentCount" AND "completedBatchCount" = "batchCount"));
ALTER TABLE "LocalizationBatch" ADD CONSTRAINT "LocalizationBatch_values_check"
  CHECK ("batchIndex" >= 0 AND jsonb_typeof("targetSegmentIds") = 'array' AND ("processingDurationMs" IS NULL OR "processingDurationMs" >= 0));
ALTER TABLE "LocalizedSegment" ADD CONSTRAINT "LocalizedSegment_timing_check"
  CHECK ("sequence" >= 0 AND "sourceStartMs" >= 0 AND "sourceEndMs" > "sourceStartMs" AND "sourceEditRevision" >= 0 AND "revision" >= 0);
ALTER TABLE "LocalizedSegment" ADD CONSTRAINT "LocalizedSegment_scores_check"
  CHECK (
    "sourceConfidence" BETWEEN 0 AND 1 AND
    ("providerConfidence" IS NULL OR "providerConfidence" BETWEEN 0 AND 1) AND
    ("confidence" IS NULL OR "confidence" BETWEEN 0 AND 1) AND
    ("characterCount" IS NULL OR "characterCount" >= 0) AND
    ("readingLoad" IS NULL OR "readingLoad" >= 0)
  );
ALTER TABLE "LocalizedSegment" ADD CONSTRAINT "LocalizedSegment_reason_array_check"
  CHECK (jsonb_typeof("confidenceReasons") = 'array');
ALTER TABLE "LocalizedSegment" ADD CONSTRAINT "LocalizedSegment_state_check"
  CHECK (
    ("editState" = 'PENDING' AND "machineDraft" IS NULL AND "currentText" IS NULL AND "reviewClassification" IS NULL AND "confidence" IS NULL) OR
    ("editState" <> 'PENDING' AND btrim(coalesce("machineDraft", '')) <> '' AND btrim(coalesce("currentText", '')) <> '' AND "reviewClassification" IS NOT NULL AND "confidence" IS NOT NULL)
  );

