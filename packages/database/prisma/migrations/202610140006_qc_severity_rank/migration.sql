ALTER TABLE "QCIssue" ADD COLUMN "severityRank" INTEGER NOT NULL DEFAULT 1;
UPDATE "QCIssue" SET "severityRank" = CASE "severity"::text WHEN 'ERROR' THEN 3 WHEN 'WARNING' THEN 2 ELSE 1 END;
ALTER TABLE "QCIssue" ALTER COLUMN "severityRank" DROP DEFAULT;
DROP INDEX IF EXISTS "QCIssue_qcRunId_state_severity_idx";
CREATE INDEX "QCIssue_qcRunId_state_severityRank_idx" ON "QCIssue"("qcRunId", "state", "severityRank");
ALTER TABLE "QCIssue" ADD CONSTRAINT "QCIssue_severityRank_check" CHECK ("severityRank" BETWEEN 1 AND 3);
