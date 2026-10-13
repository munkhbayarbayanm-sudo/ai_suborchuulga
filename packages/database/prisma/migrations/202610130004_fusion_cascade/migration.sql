-- Evidence integrity remains enforced at transaction commit. Deferral allows
-- existing Episode/Series cascade cleanup to delete derived and source rows in
-- either FK cascade order, while rejecting standalone source destruction.
ALTER TABLE "FusionRunInput" ALTER CONSTRAINT "FusionRunInput_sourceExtractionRunId_mediaAssetId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "TranscriptEvidenceLink" ALTER CONSTRAINT "TranscriptEvidenceLink_sourceSegmentId_sourceExtractionRun_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "TranscriptEvidenceLink" ALTER CONSTRAINT "TranscriptEvidenceLink_fusionRunId_sourceExtractionRunId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "Episode" ALTER CONSTRAINT "Episode_activeFusionRunId_id_fkey" DEFERRABLE INITIALLY DEFERRED;
