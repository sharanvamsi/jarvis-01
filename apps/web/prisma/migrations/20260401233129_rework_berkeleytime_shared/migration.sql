/*
  Warnings:

  - You are about to drop the `BerkeleyTimeGrade` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "BerkeleyTimeGrade" DROP CONSTRAINT "BerkeleyTimeGrade_courseId_fkey";

-- DropTable
DROP TABLE "BerkeleyTimeGrade";

-- CreateTable
CREATE TABLE "BerkeleyTimeCourse" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "courseNumber" TEXT NOT NULL,
    "historicalBackfillDone" BOOLEAN NOT NULL DEFAULT false,
    "lastIncrementalSync" TIMESTAMP(3),

    CONSTRAINT "BerkeleyTimeCourse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BerkeleyTimeSnapshot" (
    "id" TEXT NOT NULL,
    "btCourseId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "semester" TEXT NOT NULL,
    "instructor" TEXT,
    "average" DOUBLE PRECISION,
    "pnpPercentage" DOUBLE PRECISION,
    "distribution" JSONB NOT NULL,

    CONSTRAINT "BerkeleyTimeSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BerkeleyTimeCourse_subject_courseNumber_key" ON "BerkeleyTimeCourse"("subject", "courseNumber");

-- CreateIndex
CREATE INDEX "BerkeleyTimeSnapshot_btCourseId_idx" ON "BerkeleyTimeSnapshot"("btCourseId");

-- CreateIndex
CREATE UNIQUE INDEX "BerkeleyTimeSnapshot_btCourseId_year_semester_instructor_key" ON "BerkeleyTimeSnapshot"("btCourseId", "year", "semester", "instructor");

-- AddForeignKey
ALTER TABLE "BerkeleyTimeSnapshot" ADD CONSTRAINT "BerkeleyTimeSnapshot_btCourseId_fkey" FOREIGN KEY ("btCourseId") REFERENCES "BerkeleyTimeCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
