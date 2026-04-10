-- Split SyllabusDocument out of Syllabus.
-- Moves heavy raw_text column into its own table with a full sha256 content hash,
-- keeping Syllabus small and enabling proper content-hash gating for re-extraction.

-- CreateTable
CREATE TABLE "syllabus_documents" (
  "id" TEXT NOT NULL,
  "syllabus_id" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "source_url" TEXT,
  "raw_text" TEXT NOT NULL,
  "content_hash" TEXT NOT NULL,
  "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "syllabus_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "syllabus_documents_syllabus_id_key" ON "syllabus_documents"("syllabus_id");
CREATE INDEX "syllabus_documents_content_hash_idx" ON "syllabus_documents"("content_hash");

-- AddForeignKey
ALTER TABLE "syllabus_documents"
  ADD CONSTRAINT "syllabus_documents_syllabus_id_fkey"
  FOREIGN KEY ("syllabus_id") REFERENCES "syllabi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: copy existing raw_text into the new table, computing full sha256 hash.
INSERT INTO "syllabus_documents" (id, syllabus_id, source, raw_text, content_hash, fetched_at)
SELECT
  gen_random_uuid()::text,
  id,
  CASE
    WHEN source = 'canvas' THEN 'canvas_html'
    WHEN source = 'website' THEN 'website'
    ELSE source
  END,
  raw_text,
  encode(sha256(raw_text::bytea), 'hex'),
  extracted_at
FROM "syllabi"
WHERE raw_text IS NOT NULL AND raw_text <> '';

-- Drop old columns on syllabi
ALTER TABLE "syllabi" DROP COLUMN IF EXISTS "raw_text";
ALTER TABLE "syllabi" DROP COLUMN IF EXISTS "source";
