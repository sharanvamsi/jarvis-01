-- Make RawCourseWebsitePageHash course-scoped instead of user-scoped.
-- Deduplicate: keep the most recently checked row per course_id.

-- Step 1: Remove duplicate rows (keep the one with the latest last_checked per course_id)
DELETE FROM raw_course_website_page_hashes a
USING raw_course_website_page_hashes b
WHERE a.course_id = b.course_id
  AND a.last_checked < b.last_checked;

-- Step 2: Drop the old unique constraint
ALTER TABLE "raw_course_website_page_hashes" DROP CONSTRAINT IF EXISTS "raw_course_website_page_hashes_user_id_course_id_key";

-- Step 3: Drop the user_id column
ALTER TABLE "raw_course_website_page_hashes" DROP COLUMN "user_id";

-- Step 4: Add new unique constraint on course_id only
ALTER TABLE "raw_course_website_page_hashes" ADD CONSTRAINT "raw_course_website_page_hashes_course_id_key" UNIQUE ("course_id");

-- Step 5: Add foreign key to courses table
ALTER TABLE "raw_course_website_page_hashes" ADD CONSTRAINT "raw_course_website_page_hashes_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
