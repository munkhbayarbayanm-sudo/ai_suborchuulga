-- Phase 06: revision-bound document/series subtitle quality control.
ALTER TYPE "JobType" ADD VALUE 'RUN_SUBTITLE_QC';
ALTER TYPE "JobType" ADD VALUE 'RUN_SERIES_QC';

CREATE TYPE "QCRunKind" AS ENUM ('DOCUMENT','SERIES');
CREATE TYPE "QCRunStatus" AS ENUM ('QUEUED','PROCESSING','COMPLETED','FAILED','CANCELLED','STALE');
CREATE TYPE "QCAiMode" AS ENUM ('OFF','PROBLEMATIC_ONLY','ALL');
CREATE TYPE "QCAiStageStatus" AS ENUM ('NOT_REQUESTED','QUEUED','COMPLETED','UNAVAILABLE','FAILED','CANCELLED');
CREATE TYPE "QCIssueSeverity" AS ENUM ('INFO','WARNING','ERROR');
CREATE TYPE "QCIssueState" AS ENUM ('OPEN','RESOLVED','IGNORED');
CREATE TYPE "QCIssueCategory" AS ENUM ('TIMING','READABILITY','LANGUAGE','TRANSLATION','CONSISTENCY');
CREATE TYPE "QCSuggestionType" AS ENUM ('UPDATE_TEXT','RESIZE_START','RESIZE_END','SPLIT_CUE');
CREATE TYPE "QCSuggestionStatus" AS ENUM ('PENDING','APPLIED','REJECTED','STALE');

ALTER TABLE "Series" ADD COLUMN "defaultQcProfileId" UUID;

CREATE TABLE "QCProfile" (
  "id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "seriesId" UUID,
  "isSystemDefault" BOOLEAN NOT NULL DEFAULT false,
  "isArchived" BOOLEAN NOT NULL DEFAULT false,
  "settings" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QCProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QCRun" (
  "id" UUID NOT NULL,
  "kind" "QCRunKind" NOT NULL,
  "subtitleDocumentId" UUID,
  "seriesId" UUID,
  "profileId" UUID NOT NULL,
  "processingJobId" UUID NOT NULL,
  "documentRevision" INTEGER,
  "status" "QCRunStatus" NOT NULL DEFAULT 'QUEUED',
  "engineVersion" VARCHAR(80) NOT NULL,
  "settingsSnapshot" JSONB NOT NULL,
  "identityHash" VARCHAR(64) NOT NULL,
  "revisionKey" VARCHAR(36) NOT NULL DEFAULT 'default',
  "aiMode" "QCAiMode" NOT NULL DEFAULT 'OFF',
  "aiRequired" BOOLEAN NOT NULL DEFAULT false,
  "aiStageStatus" "QCAiStageStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
  "aiProvider" VARCHAR(80),
  "aiModel" VARCHAR(120),
  "aiPromptVersion" VARCHAR(80),
  "stage" VARCHAR(160) NOT NULL DEFAULT 'Queued',
  "cueCount" INTEGER NOT NULL DEFAULT 0,
  "passCount" INTEGER NOT NULL DEFAULT 0,
  "infoCount" INTEGER NOT NULL DEFAULT 0,
  "warningCount" INTEGER NOT NULL DEFAULT 0,
  "errorCount" INTEGER NOT NULL DEFAULT 0,
  "issueCount" INTEGER NOT NULL DEFAULT 0,
  "missingActiveDocumentCount" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QCRun_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QCRun_owner_check" CHECK (("kind"='DOCUMENT' AND "subtitleDocumentId" IS NOT NULL AND "seriesId" IS NULL AND "documentRevision" IS NOT NULL) OR ("kind"='SERIES' AND "subtitleDocumentId" IS NULL AND "seriesId" IS NOT NULL AND "documentRevision" IS NULL)),
  CONSTRAINT "QCRun_counts_check" CHECK ("cueCount">=0 AND "passCount">=0 AND "infoCount">=0 AND "warningCount">=0 AND "errorCount">=0 AND "issueCount">=0 AND "missingActiveDocumentCount">=0)
);

INSERT INTO "QCProfile" ("id","name","seriesId","isSystemDefault","isArchived","settings","createdAt","updatedAt") VALUES
('00000000-0000-4000-8000-000000000006','Mongolian subtitle review',NULL,true,false,'{"minimumCueDurationMs":500,"maximumCueDurationMs":10000,"maximumCharactersPerSecond":22,"maximumLineCount":2,"maximumCharactersPerLine":42,"minimumGapMs":80,"allowOverlaps":false,"denseClusterWindowMs":2000,"denseClusterCueCount":3,"untranslatedDetection":true,"aiMode":"OFF"}'::jsonb,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

CREATE TABLE "QCRunDocument" (
  "qcRunId" UUID NOT NULL,
  "subtitleDocumentId" UUID NOT NULL,
  "episodeId" UUID NOT NULL,
  "documentRevision" INTEGER NOT NULL,
  CONSTRAINT "QCRunDocument_pkey" PRIMARY KEY ("qcRunId","subtitleDocumentId"),
  CONSTRAINT "QCRunDocument_revision_check" CHECK ("documentRevision">=0)
);

CREATE TABLE "QCIssue" (
  "id" UUID NOT NULL,
  "qcRunId" UUID NOT NULL,
  "fingerprint" VARCHAR(64) NOT NULL,
  "type" VARCHAR(80) NOT NULL,
  "category" "QCIssueCategory" NOT NULL,
  "severity" "QCIssueSeverity" NOT NULL,
  "state" "QCIssueState" NOT NULL DEFAULT 'OPEN',
  "title" VARCHAR(300) NOT NULL,
  "explanation" TEXT NOT NULL,
  "metrics" JSONB NOT NULL DEFAULT '{}',
  "confidence" DOUBLE PRECISION,
  "ignoredReason" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QCIssue_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QCIssue_confidence_check" CHECK ("confidence" IS NULL OR ("confidence">=0 AND "confidence"<=1)),
  CONSTRAINT "QCIssue_ignore_reason_check" CHECK ("state"<>'IGNORED' OR length(trim(coalesce("ignoredReason",'')))>=3)
);

CREATE TABLE "QCIssueCueLink" (
  "qcIssueId" UUID NOT NULL,
  "subtitleCueId" UUID NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "QCIssueCueLink_pkey" PRIMARY KEY ("qcIssueId","subtitleCueId")
);

CREATE TABLE "QCSuggestion" (
  "id" UUID NOT NULL,
  "qcIssueId" UUID NOT NULL,
  "type" "QCSuggestionType" NOT NULL,
  "status" "QCSuggestionStatus" NOT NULL DEFAULT 'PENDING',
  "payload" JSONB NOT NULL,
  "appliedEditorOperationId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QCSuggestion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QCRun_processingJobId_key" ON "QCRun"("processingJobId");
CREATE UNIQUE INDEX "QCProfile_one_system_default_key" ON "QCProfile"("isSystemDefault") WHERE "isSystemDefault" = true;
CREATE UNIQUE INDEX "QCRun_identityHash_key" ON "QCRun"("identityHash");
CREATE UNIQUE INDEX "QCIssue_qcRunId_fingerprint_key" ON "QCIssue"("qcRunId","fingerprint");
CREATE UNIQUE INDEX "QCSuggestion_appliedEditorOperationId_key" ON "QCSuggestion"("appliedEditorOperationId");
CREATE INDEX "QCProfile_seriesId_isArchived_name_idx" ON "QCProfile"("seriesId","isArchived","name");
CREATE INDEX "QCRun_subtitleDocumentId_createdAt_idx" ON "QCRun"("subtitleDocumentId","createdAt");
CREATE INDEX "QCRun_seriesId_createdAt_idx" ON "QCRun"("seriesId","createdAt");
CREATE INDEX "QCRun_status_createdAt_idx" ON "QCRun"("status","createdAt");
CREATE INDEX "QCRunDocument_subtitleDocumentId_documentRevision_idx" ON "QCRunDocument"("subtitleDocumentId","documentRevision");
CREATE INDEX "QCRunDocument_episodeId_idx" ON "QCRunDocument"("episodeId");
CREATE INDEX "QCIssue_qcRunId_state_severity_idx" ON "QCIssue"("qcRunId","state","severity");
CREATE INDEX "QCIssue_qcRunId_category_type_idx" ON "QCIssue"("qcRunId","category","type");
CREATE INDEX "QCIssue_fingerprint_idx" ON "QCIssue"("fingerprint");
CREATE INDEX "QCIssueCueLink_subtitleCueId_idx" ON "QCIssueCueLink"("subtitleCueId");
CREATE INDEX "QCSuggestion_qcIssueId_status_idx" ON "QCSuggestion"("qcIssueId","status");

ALTER TABLE "QCProfile" ADD CONSTRAINT "QCProfile_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Series" ADD CONSTRAINT "Series_defaultQcProfileId_fkey" FOREIGN KEY ("defaultQcProfileId") REFERENCES "QCProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QCRun" ADD CONSTRAINT "QCRun_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QCRun" ADD CONSTRAINT "QCRun_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "QCProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QCRun" ADD CONSTRAINT "QCRun_processingJobId_fkey" FOREIGN KEY ("processingJobId") REFERENCES "ProcessingJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QCRunDocument" ADD CONSTRAINT "QCRunDocument_qcRunId_fkey" FOREIGN KEY ("qcRunId") REFERENCES "QCRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QCRunDocument" ADD CONSTRAINT "QCRunDocument_document_fkey" FOREIGN KEY ("subtitleDocumentId","episodeId") REFERENCES "SubtitleDocument"("id","episodeId") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "QCIssue" ADD CONSTRAINT "QCIssue_qcRunId_fkey" FOREIGN KEY ("qcRunId") REFERENCES "QCRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QCIssueCueLink" ADD CONSTRAINT "QCIssueCueLink_qcIssueId_fkey" FOREIGN KEY ("qcIssueId") REFERENCES "QCIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QCIssueCueLink" ADD CONSTRAINT "QCIssueCueLink_subtitleCueId_fkey" FOREIGN KEY ("subtitleCueId") REFERENCES "SubtitleCue"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "QCSuggestion" ADD CONSTRAINT "QCSuggestion_qcIssueId_fkey" FOREIGN KEY ("qcIssueId") REFERENCES "QCIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QCSuggestion" ADD CONSTRAINT "QCSuggestion_appliedEditorOperationId_fkey" FOREIGN KEY ("appliedEditorOperationId") REFERENCES "EditorOperation"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
