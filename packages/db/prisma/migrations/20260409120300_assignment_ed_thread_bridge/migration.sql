-- Replace Assignment.edThreadIds array with a proper AssignmentEdThread bridge table.
-- Enables reverse queries (thread -> assignments) and FK integrity.

-- CreateTable
CREATE TABLE "assignment_ed_threads" (
  "assignment_id" TEXT NOT NULL,
  "ed_thread_id" TEXT NOT NULL,
  CONSTRAINT "assignment_ed_threads_pkey" PRIMARY KEY ("assignment_id", "ed_thread_id")
);

-- CreateIndex
CREATE INDEX "assignment_ed_threads_ed_thread_id_idx" ON "assignment_ed_threads"("ed_thread_id");

-- AddForeignKey
ALTER TABLE "assignment_ed_threads"
  ADD CONSTRAINT "assignment_ed_threads_assignment_id_fkey"
  FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "assignment_ed_threads"
  ADD CONSTRAINT "assignment_ed_threads_ed_thread_id_fkey"
  FOREIGN KEY ("ed_thread_id") REFERENCES "ed_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: explode the ed_thread_ids array into bridge rows.
-- Note: the old column stored raw Ed thread IDs (e.g. "123456"), while ed_threads.id is a cuid.
-- The actual matching identifier in ed_threads is "ed_thread_id" (the Ed-side ID).
-- So we join by ed_threads.ed_thread_id and insert the ed_threads.id (cuid) as the FK.
INSERT INTO "assignment_ed_threads" (assignment_id, ed_thread_id)
SELECT DISTINCT a.id, et.id
FROM "assignments" a
CROSS JOIN LATERAL unnest(a.ed_thread_ids) AS raw_id
INNER JOIN "ed_threads" et ON et.ed_thread_id = raw_id
ON CONFLICT DO NOTHING;

-- Drop old column
ALTER TABLE "assignments" DROP COLUMN IF EXISTS "ed_thread_ids";
