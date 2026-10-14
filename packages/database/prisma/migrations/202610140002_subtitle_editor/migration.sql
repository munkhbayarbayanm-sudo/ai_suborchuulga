-- Phase 05: editable subtitle documents, auditable operations and editor media preparation.
ALTER TYPE "JobType" ADD VALUE 'GENERATE_EDITOR_PROXY';
ALTER TYPE "JobType" ADD VALUE 'GENERATE_WAVEFORM';
ALTER TYPE "DerivativeType" ADD VALUE 'EDITOR_PROXY_MP4';
ALTER TYPE "DerivativeType" ADD VALUE 'WAVEFORM_PEAKS';

CREATE TYPE "SubtitleDocumentStatus" AS ENUM ('READY', 'ARCHIVED');
CREATE TYPE "SubtitleCueStatus" AS ENUM ('NORMAL', 'REVIEW', 'APPROVED');
CREATE TYPE "SubtitleCueOrigin" AS ENUM ('LOCALIZED', 'MANUAL');
CREATE TYPE "EditorOperationType" AS ENUM ('UPDATE_TEXT','MOVE_CUE','RESIZE_START','RESIZE_END','SPLIT_CUE','MERGE_CUES','DELETE_CUE','CREATE_CUE','SET_CUE_STATUS','ACCEPT_AI_REWRITE','UNDO','REDO');
CREATE TYPE "EditorRewriteAction" AS ENUM ('RETRANSLATE','MAKE_NATURAL','SHORTER','MORE_FORMAL','MORE_CASUAL','CLOSER_TO_SOURCE');
CREATE TYPE "EditorProposalStatus" AS ENUM ('PENDING','ACCEPTED','REJECTED','SUPERSEDED');
CREATE TYPE "EditorPreparationKind" AS ENUM ('EDITOR_PROXY','WAVEFORM');

ALTER TABLE "Episode" ADD COLUMN "activeSubtitleDocumentId" UUID;

CREATE TABLE "SubtitleDocument" (
  "id" UUID NOT NULL,
  "episodeId" UUID NOT NULL,
  "mediaAssetId" UUID NOT NULL,
  "localizationRunId" UUID NOT NULL,
  "language" VARCHAR(2) NOT NULL DEFAULT 'mn',
  "name" VARCHAR(200) NOT NULL,
  "status" "SubtitleDocumentStatus" NOT NULL DEFAULT 'READY',
  "editorVersion" VARCHAR(80) NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "initializationKey" VARCHAR(36) NOT NULL,
  "identityHash" VARCHAR(64) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubtitleDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubtitleCue" (
  "id" UUID NOT NULL,
  "subtitleDocumentId" UUID NOT NULL,
  "localizationRunId" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "startMs" INTEGER NOT NULL,
  "endMs" INTEGER NOT NULL,
  "text" TEXT NOT NULL,
  "status" "SubtitleCueStatus" NOT NULL DEFAULT 'NORMAL',
  "origin" "SubtitleCueOrigin" NOT NULL DEFAULT 'LOCALIZED',
  "revision" INTEGER NOT NULL DEFAULT 0,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubtitleCue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubtitleCueSourceLink" (
  "subtitleCueId" UUID NOT NULL,
  "localizedSegmentId" UUID NOT NULL,
  "localizationRunId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubtitleCueSourceLink_pkey" PRIMARY KEY ("subtitleCueId","localizedSegmentId")
);

CREATE TABLE "EditorOperation" (
  "id" UUID NOT NULL,
  "subtitleDocumentId" UUID NOT NULL,
  "type" "EditorOperationType" NOT NULL,
  "baseRevision" INTEGER NOT NULL,
  "resultRevision" INTEGER NOT NULL,
  "beforePayload" JSONB NOT NULL,
  "afterPayload" JSONB NOT NULL,
  "targetOperationId" UUID,
  "clientOperationId" UUID,
  "groupId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EditorOperation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EditorRewriteProposal" (
  "id" UUID NOT NULL,
  "subtitleDocumentId" UUID NOT NULL,
  "subtitleCueId" UUID NOT NULL,
  "action" "EditorRewriteAction" NOT NULL,
  "status" "EditorProposalStatus" NOT NULL DEFAULT 'PENDING',
  "baseDocumentRevision" INTEGER NOT NULL,
  "currentTextSnapshot" TEXT NOT NULL,
  "proposalText" TEXT NOT NULL,
  "provider" VARCHAR(80) NOT NULL,
  "model" VARCHAR(120) NOT NULL,
  "providerVersion" VARCHAR(120),
  "confidence" DOUBLE PRECISION,
  "notes" JSONB NOT NULL DEFAULT '[]',
  "usage" JSONB,
  "acceptedOperationId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EditorRewriteProposal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EditorMediaPreparation" (
  "id" UUID NOT NULL,
  "mediaAssetId" UUID NOT NULL,
  "kind" "EditorPreparationKind" NOT NULL,
  "settings" JSONB NOT NULL,
  "settingsHash" VARCHAR(64) NOT NULL,
  "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
  "stage" TEXT,
  "processingJobId" UUID NOT NULL,
  "derivativeId" UUID,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EditorMediaPreparation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LocalizedSegment_id_localizationRunId_key" ON "LocalizedSegment"("id","localizationRunId");
CREATE UNIQUE INDEX "SubtitleDocument_identityHash_key" ON "SubtitleDocument"("identityHash");
CREATE UNIQUE INDEX "SubtitleDocument_id_episodeId_key" ON "SubtitleDocument"("id","episodeId");
CREATE UNIQUE INDEX "SubtitleDocument_id_localizationRunId_key" ON "SubtitleDocument"("id","localizationRunId");
CREATE UNIQUE INDEX "SubtitleDocument_localizationRunId_initializationKey_key" ON "SubtitleDocument"("localizationRunId","initializationKey");
CREATE INDEX "SubtitleDocument_episodeId_createdAt_idx" ON "SubtitleDocument"("episodeId","createdAt");
CREATE INDEX "SubtitleCue_document_deleted_sequence_idx" ON "SubtitleCue"("subtitleDocumentId","deletedAt","sequence");
CREATE INDEX "SubtitleCue_document_start_end_idx" ON "SubtitleCue"("subtitleDocumentId","startMs","endMs");
CREATE INDEX "SubtitleCueSourceLink_localizedSegmentId_idx" ON "SubtitleCueSourceLink"("localizedSegmentId");
CREATE UNIQUE INDEX "EditorOperation_document_resultRevision_key" ON "EditorOperation"("subtitleDocumentId","resultRevision");
CREATE UNIQUE INDEX "EditorOperation_document_clientOperationId_key" ON "EditorOperation"("subtitleDocumentId","clientOperationId");
CREATE INDEX "EditorOperation_document_createdAt_idx" ON "EditorOperation"("subtitleDocumentId","createdAt");
CREATE INDEX "EditorOperation_targetOperationId_idx" ON "EditorOperation"("targetOperationId");
CREATE UNIQUE INDEX "EditorRewriteProposal_acceptedOperationId_key" ON "EditorRewriteProposal"("acceptedOperationId");
CREATE INDEX "EditorRewriteProposal_cue_createdAt_idx" ON "EditorRewriteProposal"("subtitleCueId","createdAt");
CREATE INDEX "EditorRewriteProposal_document_status_idx" ON "EditorRewriteProposal"("subtitleDocumentId","status");
CREATE UNIQUE INDEX "EditorMediaPreparation_processingJobId_key" ON "EditorMediaPreparation"("processingJobId");
CREATE UNIQUE INDEX "EditorMediaPreparation_derivativeId_key" ON "EditorMediaPreparation"("derivativeId");
CREATE UNIQUE INDEX "EditorMediaPreparation_asset_kind_settings_key" ON "EditorMediaPreparation"("mediaAssetId","kind","settingsHash");
CREATE INDEX "EditorMediaPreparation_status_createdAt_idx" ON "EditorMediaPreparation"("status","createdAt");

ALTER TABLE "Episode" ADD CONSTRAINT "Episode_activeSubtitleDocument_fkey" FOREIGN KEY ("activeSubtitleDocumentId","id") REFERENCES "SubtitleDocument"("id","episodeId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "SubtitleDocument" ADD CONSTRAINT "SubtitleDocument_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubtitleDocument" ADD CONSTRAINT "SubtitleDocument_media_episode_fkey" FOREIGN KEY ("mediaAssetId","episodeId") REFERENCES "MediaAsset"("id","episodeId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "SubtitleDocument" ADD CONSTRAINT "SubtitleDocument_localization_episode_fkey" FOREIGN KEY ("localizationRunId","episodeId") REFERENCES "LocalizationRun"("id","episodeId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "SubtitleCue" ADD CONSTRAINT "SubtitleCue_document_localization_fkey" FOREIGN KEY ("subtitleDocumentId","localizationRunId") REFERENCES "SubtitleDocument"("id","localizationRunId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubtitleCueSourceLink" ADD CONSTRAINT "SubtitleCueSourceLink_cue_fkey" FOREIGN KEY ("subtitleCueId") REFERENCES "SubtitleCue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubtitleCueSourceLink" ADD CONSTRAINT "SubtitleCueSourceLink_localized_fkey" FOREIGN KEY ("localizedSegmentId","localizationRunId") REFERENCES "LocalizedSegment"("id","localizationRunId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "EditorOperation" ADD CONSTRAINT "EditorOperation_document_fkey" FOREIGN KEY ("subtitleDocumentId") REFERENCES "SubtitleDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EditorOperation" ADD CONSTRAINT "EditorOperation_target_fkey" FOREIGN KEY ("targetOperationId") REFERENCES "EditorOperation"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "EditorRewriteProposal" ADD CONSTRAINT "EditorRewriteProposal_document_fkey" FOREIGN KEY ("subtitleDocumentId") REFERENCES "SubtitleDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EditorRewriteProposal" ADD CONSTRAINT "EditorRewriteProposal_cue_fkey" FOREIGN KEY ("subtitleCueId") REFERENCES "SubtitleCue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EditorRewriteProposal" ADD CONSTRAINT "EditorRewriteProposal_operation_fkey" FOREIGN KEY ("acceptedOperationId") REFERENCES "EditorOperation"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "EditorMediaPreparation" ADD CONSTRAINT "EditorMediaPreparation_asset_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EditorMediaPreparation" ADD CONSTRAINT "EditorMediaPreparation_job_fkey" FOREIGN KEY ("processingJobId") REFERENCES "ProcessingJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EditorMediaPreparation" ADD CONSTRAINT "EditorMediaPreparation_derivative_fkey" FOREIGN KEY ("derivativeId") REFERENCES "MediaDerivative"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "Episode" ALTER CONSTRAINT "Episode_activeSubtitleDocument_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "SubtitleDocument" ALTER CONSTRAINT "SubtitleDocument_media_episode_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "SubtitleDocument" ALTER CONSTRAINT "SubtitleDocument_localization_episode_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "SubtitleCueSourceLink" ALTER CONSTRAINT "SubtitleCueSourceLink_localized_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "EditorOperation" ALTER CONSTRAINT "EditorOperation_target_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "EditorRewriteProposal" ALTER CONSTRAINT "EditorRewriteProposal_operation_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "EditorMediaPreparation" ALTER CONSTRAINT "EditorMediaPreparation_derivative_fkey" DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "SubtitleDocument" ADD CONSTRAINT "SubtitleDocument_values_check" CHECK (
  "language" = 'mn' AND btrim("name") <> '' AND btrim("editorVersion") <> '' AND
  "revision" >= 0 AND "identityHash" ~ '^[0-9a-f]{64}$'
);
ALTER TABLE "SubtitleCue" ADD CONSTRAINT "SubtitleCue_timing_check" CHECK (
  "sequence" >= 0 AND "startMs" >= 0 AND "endMs" > "startMs" AND "revision" >= 0
);
ALTER TABLE "SubtitleCueSourceLink" ADD CONSTRAINT "SubtitleCueSourceLink_run_check" CHECK ("localizationRunId" IS NOT NULL);
ALTER TABLE "EditorOperation" ADD CONSTRAINT "EditorOperation_revision_check" CHECK (
  "baseRevision" >= 0 AND "resultRevision" = "baseRevision" + 1 AND
  jsonb_typeof("beforePayload") = 'object' AND jsonb_typeof("afterPayload") = 'object'
);
ALTER TABLE "EditorOperation" ADD CONSTRAINT "EditorOperation_target_check" CHECK (
  (("type" IN ('UNDO','REDO')) = ("targetOperationId" IS NOT NULL))
);
ALTER TABLE "EditorRewriteProposal" ADD CONSTRAINT "EditorRewriteProposal_values_check" CHECK (
  "baseDocumentRevision" >= 0 AND btrim("currentTextSnapshot") <> '' AND
  btrim("proposalText") <> '' AND btrim("provider") <> '' AND btrim("model") <> '' AND
  ("confidence" IS NULL OR "confidence" BETWEEN 0 AND 1) AND jsonb_typeof("notes") = 'array'
);
ALTER TABLE "EditorMediaPreparation" ADD CONSTRAINT "EditorMediaPreparation_values_check" CHECK (
  "settingsHash" ~ '^[0-9a-f]{64}$' AND jsonb_typeof("settings") = 'object' AND
  (("status" = 'COMPLETED') = ("derivativeId" IS NOT NULL))
);
