-- CreateTable
CREATE TABLE "syllabi" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "extracted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),
    "confirmed_by" TEXT,
    "is_curved" BOOLEAN NOT NULL DEFAULT false,
    "curve_description" TEXT,

    CONSTRAINT "syllabi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "component_groups" (
    "id" TEXT NOT NULL,
    "syllabus_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "drop_lowest" INTEGER NOT NULL DEFAULT 0,
    "is_best_of" BOOLEAN NOT NULL DEFAULT false,
    "is_exam" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "component_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_group_mappings" (
    "id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "component_group_id" TEXT NOT NULL,

    CONSTRAINT "assignment_group_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_scales" (
    "id" TEXT NOT NULL,
    "syllabus_id" TEXT NOT NULL,
    "letter" TEXT NOT NULL,
    "min_score" DOUBLE PRECISION NOT NULL,
    "max_score" DOUBLE PRECISION NOT NULL,
    "is_points" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "grade_scales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clobber_policies" (
    "id" TEXT NOT NULL,
    "syllabus_id" TEXT NOT NULL,
    "source_name" TEXT NOT NULL,
    "target_name" TEXT NOT NULL,
    "comparison_type" TEXT NOT NULL,
    "condition_text" TEXT NOT NULL,

    CONSTRAINT "clobber_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_stats" (
    "id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "mean" DOUBLE PRECISION NOT NULL,
    "std_dev" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL,
    "ed_thread_id" TEXT,
    "posted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_stats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "syllabi_course_id_key" ON "syllabi"("course_id");

-- CreateIndex
CREATE INDEX "component_groups_syllabus_id_idx" ON "component_groups"("syllabus_id");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_group_mappings_assignment_id_component_group_id_key" ON "assignment_group_mappings"("assignment_id", "component_group_id");

-- CreateIndex
CREATE INDEX "grade_scales_syllabus_id_idx" ON "grade_scales"("syllabus_id");

-- CreateIndex
CREATE INDEX "clobber_policies_syllabus_id_idx" ON "clobber_policies"("syllabus_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_stats_assignment_id_source_key" ON "exam_stats"("assignment_id", "source");

-- AddForeignKey
ALTER TABLE "syllabi" ADD CONSTRAINT "syllabi_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_groups" ADD CONSTRAINT "component_groups_syllabus_id_fkey" FOREIGN KEY ("syllabus_id") REFERENCES "syllabi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_group_mappings" ADD CONSTRAINT "assignment_group_mappings_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_group_mappings" ADD CONSTRAINT "assignment_group_mappings_component_group_id_fkey" FOREIGN KEY ("component_group_id") REFERENCES "component_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_scales" ADD CONSTRAINT "grade_scales_syllabus_id_fkey" FOREIGN KEY ("syllabus_id") REFERENCES "syllabi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clobber_policies" ADD CONSTRAINT "clobber_policies_syllabus_id_fkey" FOREIGN KEY ("syllabus_id") REFERENCES "syllabi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_stats" ADD CONSTRAINT "exam_stats_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
