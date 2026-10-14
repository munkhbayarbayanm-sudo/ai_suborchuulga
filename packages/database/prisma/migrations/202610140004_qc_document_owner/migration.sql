-- Phase 06 follow-up: document runs are owned by the analyzed subtitle document.
ALTER TABLE "QCRun" ADD CONSTRAINT "QCRun_subtitleDocumentId_fkey"
FOREIGN KEY ("subtitleDocumentId") REFERENCES "SubtitleDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
