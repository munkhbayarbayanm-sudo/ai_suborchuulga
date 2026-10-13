-- CreateEnum
CREATE TYPE "FusionLanguage" AS ENUM ('AUTO', 'ENGLISH', 'CHINESE');

-- CreateEnum
CREATE TYPE "ReviewCategory" AS ENUM ('HIGH_CONFIDENCE', 'REVIEW_RECOMMENDED', 'LIKELY_PROBLEM');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('UNREVIEWED', 'REVIEWED', 'APPROVED');

-- CreateEnum
CREATE TYPE "DerivationType" AS ENUM ('DIRECT', 'RECONCILED', 'MANUAL');

-- CreateEnum
CREATE TYPE "EvidenceRole" AS ENUM ('PRIMARY', 'SUPPORTING', 'TIMING_ONLY', 'CONFLICTING');

-- AlterEnum
ALTER TYPE "JobType" ADD VALUE 'FUSE_TRANSCRIPT';

-- AlterTable
ALTER TABLE "Episode" ADD COLUMN     "activeFusionRunId" UUID,
ADD COLUMN     "sourceLanguage" VARCHAR(35);

-- CreateTable
CREATE TABLE "FusionRun" (
    "id" UUID NOT NULL,
    "episodeId" UUID NOT NULL,
    "mediaAssetId" UUID NOT NULL,
    "requestedLanguage" "FusionLanguage" NOT NULL,
    "canonicalLanguage" VARCHAR(2) NOT NULL,
    "languageReason" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "algorithmVersion" VARCHAR(80) NOT NULL,
    "settings" JSONB NOT NULL,
    "revision" VARCHAR(36) NOT NULL DEFAULT 'default',
    "identityHash" VARCHAR(64) NOT NULL,
    "overallConfidence" DOUBLE PRECISION,
    "coverageMetrics" JSONB,
    "processingJobId" UUID NOT NULL,
    "stage" TEXT,
    "alignmentDurationMs" INTEGER,
    "reconciliationDurationMs" INTEGER,
    "persistenceDurationMs" INTEGER,
    "processingDurationMs" INTEGER,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FusionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FusionRunInput" (
    "fusionRunId" UUID NOT NULL,
    "sourceExtractionRunId" UUID NOT NULL,
    "mediaAssetId" UUID NOT NULL,

    CONSTRAINT "FusionRunInput_pkey" PRIMARY KEY ("fusionRunId","sourceExtractionRunId")
);

-- CreateTable
CREATE TABLE "TranscriptSegment" (
    "id" UUID NOT NULL,
    "fusionRunId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "startMs" INTEGER NOT NULL,
    "endMs" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "derivedStartMs" INTEGER NOT NULL,
    "derivedEndMs" INTEGER NOT NULL,
    "derivedText" TEXT NOT NULL,
    "language" VARCHAR(2) NOT NULL,
    "speaker" VARCHAR(100),
    "confidence" DOUBLE PRECISION NOT NULL,
    "reviewCategory" "ReviewCategory" NOT NULL,
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'UNREVIEWED',
    "derivationType" "DerivationType" NOT NULL,
    "contentType" VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN',
    "confidenceReasons" JSONB NOT NULL,
    "manualEditedAt" TIMESTAMP(3),
    "editRevision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TranscriptSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranscriptEvidenceLink" (
    "transcriptSegmentId" UUID NOT NULL,
    "fusionRunId" UUID NOT NULL,
    "sourceSegmentId" UUID NOT NULL,
    "sourceExtractionRunId" UUID NOT NULL,
    "role" "EvidenceRole" NOT NULL,
    "alignmentScore" DOUBLE PRECISION NOT NULL,
    "textSimilarity" DOUBLE PRECISION,
    "temporalOverlap" DOUBLE PRECISION NOT NULL,
    "contributionWeight" DOUBLE PRECISION,

    CONSTRAINT "TranscriptEvidenceLink_pkey" PRIMARY KEY ("transcriptSegmentId","sourceSegmentId")
);

-- CreateIndex
CREATE UNIQUE INDEX "FusionRun_identityHash_key" ON "FusionRun"("identityHash");

-- CreateIndex
CREATE UNIQUE INDEX "FusionRun_processingJobId_key" ON "FusionRun"("processingJobId");

-- CreateIndex
CREATE INDEX "FusionRun_episodeId_createdAt_idx" ON "FusionRun"("episodeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FusionRun_id_episodeId_key" ON "FusionRun"("id", "episodeId");

-- CreateIndex
CREATE UNIQUE INDEX "FusionRun_id_mediaAssetId_key" ON "FusionRun"("id", "mediaAssetId");

-- CreateIndex
CREATE INDEX "FusionRunInput_sourceExtractionRunId_idx" ON "FusionRunInput"("sourceExtractionRunId");

-- CreateIndex
CREATE INDEX "TranscriptSegment_fusionRunId_startMs_sequence_idx" ON "TranscriptSegment"("fusionRunId", "startMs", "sequence");

-- CreateIndex
CREATE INDEX "TranscriptSegment_fusionRunId_reviewCategory_startMs_idx" ON "TranscriptSegment"("fusionRunId", "reviewCategory", "startMs");

-- CreateIndex
CREATE INDEX "TranscriptSegment_fusionRunId_manualEditedAt_idx" ON "TranscriptSegment"("fusionRunId", "manualEditedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TranscriptSegment_id_fusionRunId_key" ON "TranscriptSegment"("id", "fusionRunId");

-- CreateIndex
CREATE UNIQUE INDEX "TranscriptSegment_fusionRunId_sequence_key" ON "TranscriptSegment"("fusionRunId", "sequence");

-- CreateIndex
CREATE INDEX "TranscriptEvidenceLink_sourceSegmentId_idx" ON "TranscriptEvidenceLink"("sourceSegmentId");

-- CreateIndex
CREATE UNIQUE INDEX "SourceExtractionRun_id_mediaAssetId_key" ON "SourceExtractionRun"("id", "mediaAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "SourceSegment_id_extractionRunId_key" ON "SourceSegment"("id", "extractionRunId");

-- AddForeignKey
ALTER TABLE "Episode" ADD CONSTRAINT "Episode_activeFusionRunId_id_fkey" FOREIGN KEY ("activeFusionRunId", "id") REFERENCES "FusionRun"("id", "episodeId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FusionRun" ADD CONSTRAINT "FusionRun_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FusionRun" ADD CONSTRAINT "FusionRun_mediaAssetId_episodeId_fkey" FOREIGN KEY ("mediaAssetId", "episodeId") REFERENCES "MediaAsset"("id", "episodeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FusionRun" ADD CONSTRAINT "FusionRun_processingJobId_fkey" FOREIGN KEY ("processingJobId") REFERENCES "ProcessingJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FusionRunInput" ADD CONSTRAINT "FusionRunInput_fusionRunId_mediaAssetId_fkey" FOREIGN KEY ("fusionRunId", "mediaAssetId") REFERENCES "FusionRun"("id", "mediaAssetId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FusionRunInput" ADD CONSTRAINT "FusionRunInput_sourceExtractionRunId_mediaAssetId_fkey" FOREIGN KEY ("sourceExtractionRunId", "mediaAssetId") REFERENCES "SourceExtractionRun"("id", "mediaAssetId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranscriptSegment" ADD CONSTRAINT "TranscriptSegment_fusionRunId_fkey" FOREIGN KEY ("fusionRunId") REFERENCES "FusionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranscriptEvidenceLink" ADD CONSTRAINT "TranscriptEvidenceLink_transcriptSegmentId_fusionRunId_fkey" FOREIGN KEY ("transcriptSegmentId", "fusionRunId") REFERENCES "TranscriptSegment"("id", "fusionRunId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranscriptEvidenceLink" ADD CONSTRAINT "TranscriptEvidenceLink_sourceSegmentId_sourceExtractionRun_fkey" FOREIGN KEY ("sourceSegmentId", "sourceExtractionRunId") REFERENCES "SourceSegment"("id", "extractionRunId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranscriptEvidenceLink" ADD CONSTRAINT "TranscriptEvidenceLink_fusionRunId_sourceExtractionRunId_fkey" FOREIGN KEY ("fusionRunId", "sourceExtractionRunId") REFERENCES "FusionRunInput"("fusionRunId", "sourceExtractionRunId") ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "FusionRun" ADD CONSTRAINT "FusionRun_language_check" CHECK ("canonicalLanguage" IN ('en','zh'));
ALTER TABLE "FusionRun" ADD CONSTRAINT "FusionRun_confidence_check" CHECK ("overallConfidence" IS NULL OR "overallConfidence" BETWEEN 0 AND 1);
ALTER TABLE "TranscriptSegment" ADD CONSTRAINT "TranscriptSegment_timing_check" CHECK ("startMs" >= 0 AND "endMs" > "startMs" AND "derivedStartMs" >= 0 AND "derivedEndMs" > "derivedStartMs");
ALTER TABLE "TranscriptSegment" ADD CONSTRAINT "TranscriptSegment_text_check" CHECK (length(trim("text")) > 0 AND length(trim("derivedText")) > 0);
ALTER TABLE "TranscriptSegment" ADD CONSTRAINT "TranscriptSegment_confidence_check" CHECK ("confidence" BETWEEN 0 AND 1 AND "editRevision" >= 0);
ALTER TABLE "TranscriptSegment" ADD CONSTRAINT "TranscriptSegment_language_check" CHECK ("language" IN ('en','zh'));
ALTER TABLE "TranscriptEvidenceLink" ADD CONSTRAINT "TranscriptEvidenceLink_scores_check" CHECK ("alignmentScore" BETWEEN 0 AND 1 AND "temporalOverlap" BETWEEN 0 AND 1 AND ("textSimilarity" IS NULL OR "textSimilarity" BETWEEN 0 AND 1) AND ("contributionWeight" IS NULL OR "contributionWeight" BETWEEN 0 AND 1));
ALTER TABLE "TranscriptEvidenceLink" ADD CONSTRAINT "TranscriptEvidenceLink_timing_only_check" CHECK ("role" <> 'TIMING_ONLY' OR ("textSimilarity" IS NULL AND "contributionWeight" IS NULL));
