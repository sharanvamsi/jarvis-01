-- CreateTable
CREATE TABLE "BerkeleyTimeGrade" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "courseNumber" TEXT NOT NULL,
    "average" DOUBLE PRECISION,
    "pnpPercentage" DOUBLE PRECISION,
    "distribution" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BerkeleyTimeGrade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BerkeleyTimeGrade_courseId_key" ON "BerkeleyTimeGrade"("courseId");

-- AddForeignKey
ALTER TABLE "BerkeleyTimeGrade" ADD CONSTRAINT "BerkeleyTimeGrade_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
