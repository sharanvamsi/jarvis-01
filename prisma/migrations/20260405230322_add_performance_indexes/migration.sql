-- CreateIndex
CREATE INDEX "accounts_userId_provider_idx" ON "accounts"("userId", "provider");

-- CreateIndex
CREATE INDEX "assignments_course_id_is_current_semester_due_date_idx" ON "assignments"("course_id", "is_current_semester", "due_date");

-- CreateIndex
CREATE INDEX "calendar_events_user_id_start_time_idx" ON "calendar_events"("user_id", "start_time");

-- CreateIndex
CREATE INDEX "canvas_announcements_course_id_posted_at_idx" ON "canvas_announcements"("course_id", "posted_at");

-- CreateIndex
CREATE INDEX "ed_threads_course_id_thread_type_posted_at_idx" ON "ed_threads"("course_id", "thread_type", "posted_at");

-- CreateIndex
CREATE INDEX "exams_course_id_date_idx" ON "exams"("course_id", "date");

-- CreateIndex
CREATE INDEX "office_hours_course_id_day_of_week_idx" ON "office_hours"("course_id", "day_of_week");

-- CreateIndex
CREATE INDEX "sync_logs_user_id_service_status_completed_at_idx" ON "sync_logs"("user_id", "service", "status", "completed_at");

-- CreateIndex
CREATE INDEX "sync_logs_user_id_started_at_idx" ON "sync_logs"("user_id", "started_at");
