-- ExamStat becomes personal-only: users manually enter their own class stats via the UI.
-- The Ed-based class-wide auto-population path is being removed; users are the source of truth.

-- 1. Delete any class-wide rows (userId NULL was "class-wide" under old schema).
DELETE FROM "exam_stats" WHERE user_id IS NULL;

-- 2. Drop the old unique constraint that keyed on (assignment_id, source).
ALTER TABLE "exam_stats" DROP CONSTRAINT IF EXISTS "exam_stats_assignment_id_source_key";

-- 3. Drop dead columns.
ALTER TABLE "exam_stats" DROP COLUMN IF EXISTS "source";
ALTER TABLE "exam_stats" DROP COLUMN IF EXISTS "ed_thread_id";
ALTER TABLE "exam_stats" DROP COLUMN IF EXISTS "posted_at";

-- 4. Make user_id non-nullable and tighten the FK to CASCADE on user delete.
ALTER TABLE "exam_stats" ALTER COLUMN "user_id" SET NOT NULL;

ALTER TABLE "exam_stats" DROP CONSTRAINT IF EXISTS "exam_stats_user_id_fkey";
ALTER TABLE "exam_stats"
  ADD CONSTRAINT "exam_stats_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. New unique: one stat per (assignment, user).
CREATE UNIQUE INDEX "exam_stats_assignment_id_user_id_key"
  ON "exam_stats"("assignment_id", "user_id");

-- 6. Add created_at (if missing) and updated_at.
ALTER TABLE "exam_stats"
  ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "exam_stats"
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
