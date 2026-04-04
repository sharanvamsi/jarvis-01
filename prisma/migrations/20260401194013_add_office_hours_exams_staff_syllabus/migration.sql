-- CreateTable
CREATE TABLE "office_hours" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "staff_name" TEXT NOT NULL,
    "staff_role" TEXT NOT NULL DEFAULT 'ta',
    "day_of_week" INTEGER NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "location" TEXT,
    "zoom_link" TEXT,
    "is_recurring" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "office_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exams" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3),
    "location" TEXT,
    "duration_min" INTEGER,
    "past_exam_url" TEXT,
    "solution_url" TEXT,

    CONSTRAINT "exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_staff" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'staff',
    "email" TEXT,
    "photo_url" TEXT,

    CONSTRAINT "course_staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "syllabus_weeks" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "week_num" INTEGER NOT NULL,
    "topic" TEXT NOT NULL,
    "start_date" TIMESTAMP(3),
    "readings" TEXT,

    CONSTRAINT "syllabus_weeks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "syllabus_weeks_course_id_week_num_key" ON "syllabus_weeks"("course_id", "week_num");

-- AddForeignKey
ALTER TABLE "office_hours" ADD CONSTRAINT "office_hours_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_staff" ADD CONSTRAINT "course_staff_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syllabus_weeks" ADD CONSTRAINT "syllabus_weeks_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
