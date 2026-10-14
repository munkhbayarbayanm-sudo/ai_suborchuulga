-- Phase 07 correction: preserve media ownership while allowing ordered project/episode cascades.
ALTER TABLE "ProjectAsset" DROP CONSTRAINT "ProjectAsset_media_episode_fkey";
ALTER TABLE "VideoClip" DROP CONSTRAINT "VideoClip_asset_project_fkey";
ALTER TABLE "VisualOverlay" DROP CONSTRAINT "VisualOverlay_asset_project_fkey";

ALTER TABLE "ProjectAsset" ADD CONSTRAINT "ProjectAsset_media_episode_fkey" FOREIGN KEY ("mediaAssetId","episodeId") REFERENCES "MediaAsset"("id","episodeId") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "VideoClip" ADD CONSTRAINT "VideoClip_asset_project_fkey" FOREIGN KEY ("projectAssetId","videoProjectId") REFERENCES "ProjectAsset"("id","videoProjectId") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "VisualOverlay" ADD CONSTRAINT "VisualOverlay_asset_project_fkey" FOREIGN KEY ("projectAssetId","videoProjectId") REFERENCES "ProjectAsset"("id","videoProjectId") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
