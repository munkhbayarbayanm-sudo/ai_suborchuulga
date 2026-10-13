-- CreateEnum
-- Additive migration from approved Phase01; original media/schema behavior remains.
CREATE TYPE "ExtractionMethod" AS ENUM ('EMBEDDED_SUBTITLE', 'ASR', 'OCR');

-- CreateEnum
CREATE TYPE "DerivativeType" AS ENUM ('AUDIO_MONO_16K');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JobType" ADD VALUE 'EXTRACT_EMBEDDED_SUBTITLE';
ALTER TYPE "JobType" ADD VALUE 'TRANSCRIBE_AUDIO';
ALTER TYPE "JobType" ADD VALUE 'OCR_BURNED_SUBTITLE';

-- CreateTable
CREATE TABLE "SourceExtractionRun" (
    "id" UUID NOT NULL,
    "episodeId" UUID NOT NULL,
    "mediaAssetId" UUID NOT NULL,
    "streamId" UUID,
    "streamIndex" INTEGER,
    "method" "ExtractionMethod" NOT NULL,
    "provider" VARCHAR(80) NOT NULL,
    "providerVersion" VARCHAR(120),
    "modelVersion" VARCHAR(200),
    "languageRequested" VARCHAR(35),
    "languageDetected" VARCHAR(35),
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "settings" JSONB NOT NULL,
    "settingsHash" VARCHAR(64) NOT NULL,
    "revision" VARCHAR(36) NOT NULL DEFAULT 'default',
    "identityHash" VARCHAR(64) NOT NULL,
    "processingJobId" UUID NOT NULL,
    "stage" TEXT,
    "device" VARCHAR(8),
    "processingDurationMs" INTEGER,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceExtractionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceSegment" (
    "id" UUID NOT NULL,
    "extractionRunId" UUID NOT NULL,
    "startMs" INTEGER NOT NULL,
    "endMs" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "language" VARCHAR(35),
    "confidence" DOUBLE PRECISION,
    "speaker" VARCHAR(100),
    "sequence" INTEGER NOT NULL,
    "words" JSONB NOT NULL DEFAULT '[]',
    "providerMetadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaDerivative" (
    "id" UUID NOT NULL,
    "mediaAssetId" UUID NOT NULL,
    "type" "DerivativeType" NOT NULL,
    "streamIndex" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "settings" JSONB NOT NULL,
    "settingsHash" VARCHAR(64) NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaDerivative_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SourceExtractionRun_identityHash_key" ON "SourceExtractionRun"("identityHash");

-- CreateIndex
CREATE UNIQUE INDEX "SourceExtractionRun_processingJobId_key" ON "SourceExtractionRun"("processingJobId");

-- CreateIndex
CREATE INDEX "SourceExtractionRun_episodeId_createdAt_idx" ON "SourceExtractionRun"("episodeId", "createdAt");

-- CreateIndex
CREATE INDEX "SourceExtractionRun_mediaAssetId_method_idx" ON "SourceExtractionRun"("mediaAssetId", "method");

-- CreateIndex
CREATE INDEX "SourceSegment_extractionRunId_startMs_sequence_idx" ON "SourceSegment"("extractionRunId", "startMs", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "SourceSegment_extractionRunId_sequence_key" ON "SourceSegment"("extractionRunId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "MediaDerivative_storageKey_key" ON "MediaDerivative"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "MediaDerivative_mediaAssetId_type_streamIndex_settingsHash_key" ON "MediaDerivative"("mediaAssetId", "type", "streamIndex", "settingsHash");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_id_episodeId_key" ON "MediaAsset"("id", "episodeId");

-- CreateIndex
CREATE UNIQUE INDEX "MediaStream_id_mediaAssetId_key" ON "MediaStream"("id", "mediaAssetId");

-- AddForeignKey
ALTER TABLE "SourceExtractionRun" ADD CONSTRAINT "SourceExtractionRun_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceExtractionRun" ADD CONSTRAINT "SourceExtractionRun_mediaAssetId_episodeId_fkey" FOREIGN KEY ("mediaAssetId", "episodeId") REFERENCES "MediaAsset"("id", "episodeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceExtractionRun" ADD CONSTRAINT "SourceExtractionRun_streamId_mediaAssetId_fkey" FOREIGN KEY ("streamId", "mediaAssetId") REFERENCES "MediaStream"("id", "mediaAssetId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceExtractionRun" ADD CONSTRAINT "SourceExtractionRun_processingJobId_fkey" FOREIGN KEY ("processingJobId") REFERENCES "ProcessingJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceSegment" ADD CONSTRAINT "SourceSegment_extractionRunId_fkey" FOREIGN KEY ("extractionRunId") REFERENCES "SourceExtractionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaDerivative" ADD CONSTRAINT "MediaDerivative_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SourceSegment" ADD CONSTRAINT "SourceSegment_timing_check" CHECK ("startMs" >= 0 AND "endMs" > "startMs");
ALTER TABLE "SourceSegment" ADD CONSTRAINT "SourceSegment_text_check" CHECK (length(btrim("text")) > 0);
ALTER TABLE "SourceSegment" ADD CONSTRAINT "SourceSegment_confidence_check" CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1));
ALTER TABLE "SourceSegment" ADD CONSTRAINT "SourceSegment_words_check" CHECK (jsonb_typeof("words") = 'array');
