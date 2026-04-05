-- CreateIndex
CREATE UNIQUE INDEX "course_staff_course_id_name_role_key" ON "course_staff"("course_id", "name", "role");

-- CreateIndex
CREATE UNIQUE INDEX "exams_course_id_name_date_key" ON "exams"("course_id", "name", "date");

-- CreateIndex
CREATE UNIQUE INDEX "office_hours_course_id_day_of_week_start_time_staff_name_key" ON "office_hours"("course_id", "day_of_week", "start_time", "staff_name");
