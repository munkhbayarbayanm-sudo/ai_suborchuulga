-- Phase 07: non-destructive video projects, timeline media and auditable edit history.
CREATE TYPE "VideoProjectStatus" AS ENUM ('READY', 'ARCHIVED');
CREATE TYPE "VideoTrackType" AS ENUM ('VIDEO', 'AUDIO', 'IMAGE', 'TEXT', 'SUBTITLE', 'EFFECT');
CREATE TYPE "ProjectAssetKind" AS ENUM ('VIDEO', 'AUDIO', 'IMAGE');
CREATE TYPE "VideoFitMode" AS ENUM ('FIT', 'FILL', 'STRETCH');
CREATE TYPE "VisualOverlayType" AS ENUM ('IMAGE', 'TEXT', 'BLUR');
CREATE TYPE "VideoEditOperationType" AS ENUM ('SPLIT_CLIP','TRIM_CLIP_START','TRIM_CLIP_END','MOVE_CLIP','DELETE_CLIP','SET_LINKED','UPDATE_CLIP','CREATE_CLIP','CREATE_OVERLAY','UPDATE_OVERLAY','DELETE_OVERLAY','UPDATE_TRACK','UPDATE_PROJECT','UNDO','REDO');

CREATE TABLE "VideoProject" (
  "id" UUID NOT NULL,
  "episodeId" UUID NOT NULL,
  "activeSubtitleDocumentId" UUID,
  "name" VARCHAR(200) NOT NULL,
  "status" "VideoProjectStatus" NOT NULL DEFAULT 'READY',
  "revision" INTEGER NOT NULL DEFAULT 0,
  "initializationKey" VARCHAR(36) NOT NULL,
  "canvasWidth" INTEGER NOT NULL,
  "canvasHeight" INTEGER NOT NULL,
  "frameRate" DOUBLE PRECISION NOT NULL DEFAULT 30,
  "background" VARCHAR(7) NOT NULL DEFAULT '#000000',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VideoProject_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VideoTrack" (
  "id" UUID NOT NULL,
  "videoProjectId" UUID NOT NULL,
  "type" "VideoTrackType" NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "order" INTEGER NOT NULL,
  "locked" BOOLEAN NOT NULL DEFAULT false,
  "hidden" BOOLEAN NOT NULL DEFAULT false,
  "muted" BOOLEAN NOT NULL DEFAULT false,
  "solo" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VideoTrack_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectAsset" (
  "id" UUID NOT NULL,
  "videoProjectId" UUID NOT NULL,
  "episodeId" UUID NOT NULL,
  "mediaAssetId" UUID NOT NULL,
  "kind" "ProjectAssetKind" NOT NULL,
  "name" VARCHAR(240) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VideoClip" (
  "id" UUID NOT NULL,
  "videoProjectId" UUID NOT NULL,
  "trackId" UUID NOT NULL,
  "projectAssetId" UUID NOT NULL,
  "originClipId" UUID,
  "linkGroupId" UUID,
  "timelineStartMs" INTEGER NOT NULL,
  "sourceInMs" INTEGER NOT NULL,
  "sourceOutMs" INTEGER NOT NULL,
  "playbackRate" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "fitMode" "VideoFitMode" NOT NULL DEFAULT 'FIT',
  "positionX" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "positionY" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "scaleX" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "scaleY" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "rotationDeg" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "opacity" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "cropX" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "cropY" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "cropWidth" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "cropHeight" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "brightness" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "contrast" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "saturation" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "volume" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "muted" BOOLEAN NOT NULL DEFAULT false,
  "fadeInMs" INTEGER NOT NULL DEFAULT 0,
  "fadeOutMs" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VideoClip_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VisualOverlay" (
  "id" UUID NOT NULL,
  "videoProjectId" UUID NOT NULL,
  "trackId" UUID NOT NULL,
  "projectAssetId" UUID,
  "type" "VisualOverlayType" NOT NULL,
  "timelineStartMs" INTEGER NOT NULL,
  "timelineEndMs" INTEGER NOT NULL,
  "positionX" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "positionY" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "width" DOUBLE PRECISION NOT NULL DEFAULT 0.25,
  "height" DOUBLE PRECISION NOT NULL DEFAULT 0.15,
  "rotationDeg" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "opacity" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "text" TEXT,
  "fontFamily" VARCHAR(80),
  "fontSize" DOUBLE PRECISION,
  "fontWeight" INTEGER,
  "textColor" VARCHAR(7),
  "alignment" VARCHAR(12),
  "blurStrength" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VisualOverlay_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VideoEditOperation" (
  "id" UUID NOT NULL,
  "videoProjectId" UUID NOT NULL,
  "type" "VideoEditOperationType" NOT NULL,
  "baseRevision" INTEGER NOT NULL,
  "resultRevision" INTEGER NOT NULL,
  "beforePayload" JSONB NOT NULL,
  "afterPayload" JSONB NOT NULL,
  "targetOperationId" UUID,
  "clientOperationId" UUID,
  "groupId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VideoEditOperation_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Episode" ADD COLUMN "activeVideoProjectId" UUID;

CREATE UNIQUE INDEX "VideoProject_id_episodeId_key" ON "VideoProject"("id","episodeId");
CREATE UNIQUE INDEX "VideoProject_episodeId_initializationKey_key" ON "VideoProject"("episodeId","initializationKey");
CREATE INDEX "VideoProject_episodeId_createdAt_idx" ON "VideoProject"("episodeId","createdAt");
CREATE UNIQUE INDEX "VideoTrack_id_videoProjectId_key" ON "VideoTrack"("id","videoProjectId");
CREATE UNIQUE INDEX "VideoTrack_videoProjectId_order_key" ON "VideoTrack"("videoProjectId","order");
CREATE INDEX "VideoTrack_videoProjectId_type_order_idx" ON "VideoTrack"("videoProjectId","type","order");
CREATE UNIQUE INDEX "ProjectAsset_id_videoProjectId_key" ON "ProjectAsset"("id","videoProjectId");
CREATE UNIQUE INDEX "ProjectAsset_videoProjectId_mediaAssetId_key" ON "ProjectAsset"("videoProjectId","mediaAssetId");
CREATE INDEX "ProjectAsset_videoProjectId_kind_createdAt_idx" ON "ProjectAsset"("videoProjectId","kind","createdAt");
CREATE INDEX "ProjectAsset_mediaAssetId_idx" ON "ProjectAsset"("mediaAssetId");
CREATE INDEX "VideoClip_videoProjectId_trackId_timelineStartMs_idx" ON "VideoClip"("videoProjectId","trackId","timelineStartMs");
CREATE INDEX "VideoClip_videoProjectId_linkGroupId_idx" ON "VideoClip"("videoProjectId","linkGroupId");
CREATE INDEX "VideoClip_projectAssetId_idx" ON "VideoClip"("projectAssetId");
CREATE INDEX "VisualOverlay_videoProjectId_trackId_timelineStartMs_idx" ON "VisualOverlay"("videoProjectId","trackId","timelineStartMs");
CREATE INDEX "VisualOverlay_videoProjectId_timelineStartMs_timelineEndMs_idx" ON "VisualOverlay"("videoProjectId","timelineStartMs","timelineEndMs");
CREATE UNIQUE INDEX "VideoEditOperation_videoProjectId_resultRevision_key" ON "VideoEditOperation"("videoProjectId","resultRevision");
CREATE UNIQUE INDEX "VideoEditOperation_videoProjectId_clientOperationId_key" ON "VideoEditOperation"("videoProjectId","clientOperationId");
CREATE INDEX "VideoEditOperation_videoProjectId_createdAt_idx" ON "VideoEditOperation"("videoProjectId","createdAt");
CREATE INDEX "VideoEditOperation_targetOperationId_idx" ON "VideoEditOperation"("targetOperationId");

ALTER TABLE "VideoProject" ADD CONSTRAINT "VideoProject_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VideoProject" ADD CONSTRAINT "VideoProject_subtitle_episode_fkey" FOREIGN KEY ("activeSubtitleDocumentId","episodeId") REFERENCES "SubtitleDocument"("id","episodeId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "Episode" ADD CONSTRAINT "Episode_activeVideoProject_fkey" FOREIGN KEY ("activeVideoProjectId","id") REFERENCES "VideoProject"("id","episodeId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "VideoTrack" ADD CONSTRAINT "VideoTrack_project_fkey" FOREIGN KEY ("videoProjectId") REFERENCES "VideoProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectAsset" ADD CONSTRAINT "ProjectAsset_project_episode_fkey" FOREIGN KEY ("videoProjectId","episodeId") REFERENCES "VideoProject"("id","episodeId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectAsset" ADD CONSTRAINT "ProjectAsset_media_episode_fkey" FOREIGN KEY ("mediaAssetId","episodeId") REFERENCES "MediaAsset"("id","episodeId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VideoClip" ADD CONSTRAINT "VideoClip_project_fkey" FOREIGN KEY ("videoProjectId") REFERENCES "VideoProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VideoClip" ADD CONSTRAINT "VideoClip_track_project_fkey" FOREIGN KEY ("trackId","videoProjectId") REFERENCES "VideoTrack"("id","videoProjectId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VideoClip" ADD CONSTRAINT "VideoClip_asset_project_fkey" FOREIGN KEY ("projectAssetId","videoProjectId") REFERENCES "ProjectAsset"("id","videoProjectId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VideoClip" ADD CONSTRAINT "VideoClip_origin_fkey" FOREIGN KEY ("originClipId") REFERENCES "VideoClip"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VisualOverlay" ADD CONSTRAINT "VisualOverlay_project_fkey" FOREIGN KEY ("videoProjectId") REFERENCES "VideoProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VisualOverlay" ADD CONSTRAINT "VisualOverlay_track_project_fkey" FOREIGN KEY ("trackId","videoProjectId") REFERENCES "VideoTrack"("id","videoProjectId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VisualOverlay" ADD CONSTRAINT "VisualOverlay_asset_project_fkey" FOREIGN KEY ("projectAssetId","videoProjectId") REFERENCES "ProjectAsset"("id","videoProjectId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VideoEditOperation" ADD CONSTRAINT "VideoEditOperation_project_fkey" FOREIGN KEY ("videoProjectId") REFERENCES "VideoProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VideoEditOperation" ADD CONSTRAINT "VideoEditOperation_target_fkey" FOREIGN KEY ("targetOperationId") REFERENCES "VideoEditOperation"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "VideoProject" ALTER CONSTRAINT "VideoProject_subtitle_episode_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "Episode" ALTER CONSTRAINT "Episode_activeVideoProject_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "VideoEditOperation" ALTER CONSTRAINT "VideoEditOperation_target_fkey" DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "VideoProject" ADD CONSTRAINT "VideoProject_values_check" CHECK (
  btrim("name") <> '' AND "revision" >= 0 AND "canvasWidth" > 0 AND "canvasHeight" > 0 AND
  "frameRate" > 0 AND "background" ~ '^#[0-9A-Fa-f]{6}$'
);
ALTER TABLE "VideoTrack" ADD CONSTRAINT "VideoTrack_values_check" CHECK (btrim("name") <> '' AND "order" >= 0);
ALTER TABLE "ProjectAsset" ADD CONSTRAINT "ProjectAsset_values_check" CHECK (btrim("name") <> '');
ALTER TABLE "VideoClip" ADD CONSTRAINT "VideoClip_values_check" CHECK (
  "timelineStartMs" >= 0 AND "sourceInMs" >= 0 AND "sourceOutMs" > "sourceInMs" AND "playbackRate" BETWEEN 0.25 AND 4 AND
  "positionX" BETWEEN 0 AND 1 AND "positionY" BETWEEN 0 AND 1 AND "scaleX" BETWEEN 0.05 AND 20 AND "scaleY" BETWEEN 0.05 AND 20 AND
  "opacity" BETWEEN 0 AND 1 AND "cropX" BETWEEN 0 AND 1 AND "cropY" BETWEEN 0 AND 1 AND "cropWidth" BETWEEN 0.001 AND 1 AND
  "cropHeight" BETWEEN 0.001 AND 1 AND "cropX" + "cropWidth" <= 1 AND "cropY" + "cropHeight" <= 1 AND
  "brightness" BETWEEN 0 AND 3 AND "contrast" BETWEEN 0 AND 3 AND "saturation" BETWEEN 0 AND 3 AND
  "volume" BETWEEN 0 AND 2 AND "fadeInMs" >= 0 AND "fadeOutMs" >= 0
);
ALTER TABLE "VisualOverlay" ADD CONSTRAINT "VisualOverlay_values_check" CHECK (
  "timelineStartMs" >= 0 AND "timelineEndMs" > "timelineStartMs" AND "positionX" BETWEEN 0 AND 1 AND "positionY" BETWEEN 0 AND 1 AND
  "width" BETWEEN 0.001 AND 1 AND "height" BETWEEN 0.001 AND 1 AND "opacity" BETWEEN 0 AND 1 AND
  ("textColor" IS NULL OR "textColor" ~ '^#[0-9A-Fa-f]{6}$') AND ("blurStrength" IS NULL OR "blurStrength" BETWEEN 0 AND 50)
);
ALTER TABLE "VideoEditOperation" ADD CONSTRAINT "VideoEditOperation_revision_check" CHECK (
  "baseRevision" >= 0 AND "resultRevision" = "baseRevision" + 1 AND
  jsonb_typeof("beforePayload") = 'object' AND jsonb_typeof("afterPayload") = 'object'
);
ALTER TABLE "VideoEditOperation" ADD CONSTRAINT "VideoEditOperation_target_check" CHECK (
  (("type" IN ('UNDO','REDO')) = ("targetOperationId" IS NOT NULL))
);
