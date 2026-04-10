-- Convert raw_course_website_assignments from per-user to per-course.
-- Course website data is identical across all students in a course;
-- storing it per-user duplicated every row N times.

-- 1. Drop FK to users
ALTER TABLE "raw_course_website_assignments"
  DROP CONSTRAINT IF EXISTS "raw_course_website_assignments_user_id_fkey";

-- 2. Dedupe: for each (course_id, name), keep the row with the latest synced_at.
DELETE FROM "raw_course_website_assignments" a
USING "raw_course_website_assignments" b
WHERE a.course_id = b.course_id
  AND a.name = b.name
  AND (
    a.synced_at < b.synced_at
    OR (a.synced_at = b.synced_at AND a.id < b.id)
  );

-- 3. Drop per-user columns
ALTER TABLE "raw_course_website_assignments" DROP COLUMN IF EXISTS "user_id";
ALTER TABLE "raw_course_website_assignments" DROP COLUMN IF EXISTS "course_name";

-- 4. Add course FK (if not already present via course_id)
ALTER TABLE "raw_course_website_assignments"
  ADD CONSTRAINT "raw_course_website_assignments_course_id_fkey"
  FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. New unique constraint
CREATE UNIQUE INDEX "raw_course_website_assignments_course_id_name_key"
  ON "raw_course_website_assignments"("course_id", "name");
