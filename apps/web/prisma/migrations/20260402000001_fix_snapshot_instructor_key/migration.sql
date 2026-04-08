-- Drop old unique constraint
DROP INDEX IF EXISTS "BerkeleyTimeSnapshot_btCourseId_year_semester_instructor_key";

-- Add instructorKey column with default for existing rows
ALTER TABLE "BerkeleyTimeSnapshot" ADD COLUMN "instructorKey" TEXT NOT NULL DEFAULT '__all__';

-- Set instructorKey from instructor for any non-null instructor rows
UPDATE "BerkeleyTimeSnapshot"
SET "instructorKey" = "instructor"
WHERE "instructor" IS NOT NULL AND "instructor" != '';

-- Set instructor to NULL where it's empty string
UPDATE "BerkeleyTimeSnapshot"
SET "instructor" = NULL
WHERE "instructor" = '';

-- Remove the default now that all rows are populated
ALTER TABLE "BerkeleyTimeSnapshot" ALTER COLUMN "instructorKey" DROP DEFAULT;

-- Add new unique constraint using instructorKey
CREATE UNIQUE INDEX "BerkeleyTimeSnapshot_btCourseId_year_semester_instructorKey_key" ON "BerkeleyTimeSnapshot"("btCourseId", "year", "semester", "instructorKey");
