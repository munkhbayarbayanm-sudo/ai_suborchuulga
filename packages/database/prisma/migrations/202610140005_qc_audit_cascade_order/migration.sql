-- Phase 06 follow-up: preserve the audit reference while allowing whole document cascades
-- to delete suggestions and operations in either PostgreSQL cascade order.
ALTER TABLE "QCSuggestion" DROP CONSTRAINT "QCSuggestion_appliedEditorOperationId_fkey";
ALTER TABLE "QCSuggestion" ADD CONSTRAINT "QCSuggestion_appliedEditorOperationId_fkey"
FOREIGN KEY ("appliedEditorOperationId") REFERENCES "EditorOperation"("id")
ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
