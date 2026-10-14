-- Human-approved memory keeps immutable approval provenance after archival.
-- TRUSTED is required at creation/approval time by application logic, while a
-- later manual edit must be able to archive the superseded entry.
ALTER TABLE "TranslationMemoryEntry" DROP CONSTRAINT "TranslationMemoryEntry_origin_check";
ALTER TABLE "TranslationMemoryEntry" ADD CONSTRAINT "TranslationMemoryEntry_origin_check"
  CHECK (
    ("origin" <> 'HUMAN_APPROVED' OR ("sourceLocalizedSegmentId" IS NOT NULL AND "sourceRevision" >= 0)) AND
    ("origin" <> 'AI_SUGGESTED' OR "status" <> 'TRUSTED')
  );
