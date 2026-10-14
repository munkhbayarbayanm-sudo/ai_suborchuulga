ALTER TYPE "JobType" ADD VALUE 'RENDER_VIDEO_PROJECT';

CREATE TYPE "RenderOutputKind" AS ENUM ('VIDEO', 'SRT', 'ASS');

CREATE TABLE "RenderRequest" (
  "id" UUID NOT NULL,
  "videoProjectId" UUID NOT NULL,
  "clientRequestId" UUID NOT NULL,
  "settings" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RenderRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RenderSnapshot" (
  "id" UUID NOT NULL,
  "renderRequestId" UUID NOT NULL,
  "videoProjectId" UUID NOT NULL,
  "videoProjectRevision" INTEGER NOT NULL,
  "subtitleDocumentId" UUID,
  "subtitleDocumentRevision" INTEGER,
  "rendererVersion" VARCHAR(80) NOT NULL,
  "fingerprint" VARCHAR(64) NOT NULL,
  "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RenderSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RenderJob" (
  "id" UUID NOT NULL,
  "renderSnapshotId" UUID NOT NULL,
  "processingJobId" UUID NOT NULL,
  "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
  "stage" VARCHAR(80) NOT NULL DEFAULT 'Queued',
  "progress" INTEGER NOT NULL DEFAULT 0,
  "renderedMs" INTEGER NOT NULL DEFAULT 0,
  "speed" DOUBLE PRECISION,
  "etaSeconds" INTEGER,
  "cancellationRequested" BOOLEAN NOT NULL DEFAULT false,
  "attempt" INTEGER NOT NULL DEFAULT 1,
  "errorCode" VARCHAR(80),
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RenderJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RenderOutput" (
  "id" UUID NOT NULL,
  "renderJobId" UUID NOT NULL,
  "kind" "RenderOutputKind" NOT NULL,
  "filename" VARCHAR(255) NOT NULL,
  "storageKey" TEXT NOT NULL,
  "mimeType" VARCHAR(100) NOT NULL,
  "container" VARCHAR(40) NOT NULL,
  "sizeBytes" BIGINT NOT NULL,
  "checksumSha256" VARCHAR(64) NOT NULL,
  "durationMs" INTEGER,
  "width" INTEGER,
  "height" INTEGER,
  "videoCodec" VARCHAR(80),
  "audioCodec" VARCHAR(80),
  "subtitleCodec" VARCHAR(80),
  "validation" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RenderOutput_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RenderRequest_videoProjectId_clientRequestId_key" ON "RenderRequest"("videoProjectId", "clientRequestId");
CREATE INDEX "RenderRequest_videoProjectId_createdAt_idx" ON "RenderRequest"("videoProjectId", "createdAt");
CREATE UNIQUE INDEX "RenderSnapshot_renderRequestId_key" ON "RenderSnapshot"("renderRequestId");
CREATE INDEX "RenderSnapshot_videoProjectId_videoProjectRevision_idx" ON "RenderSnapshot"("videoProjectId", "videoProjectRevision");
CREATE INDEX "RenderSnapshot_fingerprint_idx" ON "RenderSnapshot"("fingerprint");
CREATE UNIQUE INDEX "RenderJob_renderSnapshotId_key" ON "RenderJob"("renderSnapshotId");
CREATE UNIQUE INDEX "RenderJob_processingJobId_key" ON "RenderJob"("processingJobId");
CREATE INDEX "RenderJob_status_createdAt_idx" ON "RenderJob"("status", "createdAt");
CREATE INDEX "RenderJob_renderSnapshotId_createdAt_idx" ON "RenderJob"("renderSnapshotId", "createdAt");
CREATE UNIQUE INDEX "RenderOutput_storageKey_key" ON "RenderOutput"("storageKey");
CREATE UNIQUE INDEX "RenderOutput_renderJobId_kind_key" ON "RenderOutput"("renderJobId", "kind");
CREATE INDEX "RenderOutput_renderJobId_createdAt_idx" ON "RenderOutput"("renderJobId", "createdAt");

ALTER TABLE "RenderRequest" ADD CONSTRAINT "RenderRequest_videoProjectId_fkey" FOREIGN KEY ("videoProjectId") REFERENCES "VideoProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RenderSnapshot" ADD CONSTRAINT "RenderSnapshot_renderRequestId_fkey" FOREIGN KEY ("renderRequestId") REFERENCES "RenderRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RenderJob" ADD CONSTRAINT "RenderJob_renderSnapshotId_fkey" FOREIGN KEY ("renderSnapshotId") REFERENCES "RenderSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RenderJob" ADD CONSTRAINT "RenderJob_processingJobId_fkey" FOREIGN KEY ("processingJobId") REFERENCES "ProcessingJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RenderOutput" ADD CONSTRAINT "RenderOutput_renderJobId_fkey" FOREIGN KEY ("renderJobId") REFERENCES "RenderJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RenderJob" ADD CONSTRAINT "RenderJob_progress_check" CHECK ("progress" >= 0 AND "progress" <= 100);
ALTER TABLE "RenderJob" ADD CONSTRAINT "RenderJob_rendered_check" CHECK ("renderedMs" >= 0);
ALTER TABLE "RenderOutput" ADD CONSTRAINT "RenderOutput_size_check" CHECK ("sizeBytes" > 0);
