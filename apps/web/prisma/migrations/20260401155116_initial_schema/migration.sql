-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "current_semester" TEXT NOT NULL DEFAULT 'SP26',
    "onboarding_done" BOOLEAN NOT NULL DEFAULT false,
    "last_sync_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" TEXT NOT NULL,
    "course_code" TEXT NOT NULL,
    "course_name" TEXT NOT NULL,
    "term" TEXT,
    "enrollment_state" TEXT,
    "canvas_id" TEXT,
    "gradescope_id" TEXT,
    "ed_course_id" TEXT,
    "website_url" TEXT,
    "is_current_semester" BOOLEAN NOT NULL DEFAULT false,
    "last_unified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'student',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assignment_type" TEXT,
    "due_date" TIMESTAMP(3),
    "release_date" TIMESTAMP(3),
    "points_possible" DOUBLE PRECISION,
    "submission_types" TEXT[],
    "spec_url" TEXT,
    "html_url" TEXT,
    "canvas_id" TEXT,
    "gradescope_id" TEXT,
    "course_website_id" TEXT,
    "ed_thread_ids" TEXT[],
    "submission_platform" TEXT,
    "is_current_semester" BOOLEAN NOT NULL DEFAULT false,
    "last_unified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_assignments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "grade" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ungraded',
    "submitted_at" TIMESTAMP(3),
    "is_late" BOOLEAN NOT NULL DEFAULT false,
    "late_info" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canvas_announcements" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "canvas_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "posted_at" TIMESTAMP(3),
    "html_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "canvas_announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ed_threads" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "ed_thread_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "thread_type" TEXT NOT NULL,
    "is_announcement" BOOLEAN NOT NULL DEFAULT false,
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "content_preview" TEXT,
    "linked_assignment" TEXT,
    "answer_count" INTEGER NOT NULL DEFAULT 0,
    "vote_count" INTEGER NOT NULL DEFAULT 0,
    "is_answered" BOOLEAN NOT NULL DEFAULT false,
    "url" TEXT,
    "posted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ed_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_events" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "google_event_id" TEXT,
    "title" TEXT NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "is_all_day" BOOLEAN NOT NULL DEFAULT false,
    "is_class_event" BOOLEAN NOT NULL DEFAULT false,
    "course_code" TEXT,
    "berkeley_start" TIMESTAMP(3),
    "berkeley_end" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unified_mismatches" (
    "id" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "unified_id" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "source_a" TEXT NOT NULL,
    "value_a" TEXT,
    "source_b" TEXT NOT NULL,
    "value_b" TEXT,
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolved_value" TEXT,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "unified_mismatches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_overrides" (
    "id" TEXT NOT NULL,
    "unified_id" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "set_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "is_initial_backfill" BOOLEAN NOT NULL DEFAULT false,
    "records_fetched" INTEGER NOT NULL DEFAULT 0,
    "records_created" INTEGER NOT NULL DEFAULT 0,
    "records_updated" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_api_snapshots" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "raw_json" JSONB NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_api_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_canvas_courses" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "canvas_course_id" TEXT NOT NULL,
    "name" TEXT,
    "course_code" TEXT,
    "term" TEXT,
    "enrollment_state" TEXT,
    "canvas_url" TEXT,
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "raw_json" JSONB NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_canvas_courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_canvas_assignments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "canvas_assignment_id" TEXT NOT NULL,
    "canvas_course_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "due_date" TIMESTAMP(3),
    "points_possible" DOUBLE PRECISION,
    "submission_types" TEXT[],
    "html_url" TEXT,
    "raw_json" JSONB NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_canvas_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_canvas_submissions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "canvas_assignment_id" TEXT NOT NULL,
    "workflow_state" TEXT,
    "score" DOUBLE PRECISION,
    "grade" TEXT,
    "submitted_at" TIMESTAMP(3),
    "raw_json" JSONB NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_canvas_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_canvas_announcements" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "canvas_announcement_id" TEXT NOT NULL,
    "canvas_course_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "posted_at" TIMESTAMP(3),
    "html_url" TEXT,
    "raw_json" JSONB NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_canvas_announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_gradescope_courses" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "gradescope_id" TEXT NOT NULL,
    "short_name" TEXT,
    "name" TEXT,
    "term" TEXT,
    "role" TEXT,
    "raw_json" JSONB NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_gradescope_courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_gradescope_assignments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "gradescope_id" TEXT NOT NULL,
    "course_gradescope_id" TEXT NOT NULL,
    "name" TEXT,
    "title" TEXT,
    "url" TEXT,
    "release_date" TIMESTAMP(3),
    "due_date" TIMESTAMP(3),
    "hard_due_date" TIMESTAMP(3),
    "total_points" DOUBLE PRECISION,
    "earned_points" DOUBLE PRECISION,
    "submitted" BOOLEAN NOT NULL DEFAULT false,
    "submission_state" TEXT,
    "status" TEXT,
    "late_info" TEXT,
    "raw_json" JSONB NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_gradescope_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_ed_threads" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "ed_thread_id" TEXT NOT NULL,
    "ed_course_id" TEXT NOT NULL,
    "course_name" TEXT,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "is_announcement" BOOLEAN NOT NULL DEFAULT false,
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "content_preview" TEXT,
    "linked_assignment" TEXT,
    "answer_count" INTEGER NOT NULL DEFAULT 0,
    "vote_count" INTEGER NOT NULL DEFAULT 0,
    "is_answered" BOOLEAN NOT NULL DEFAULT false,
    "url" TEXT,
    "thread_created_at" TIMESTAMP(3),
    "raw_json" JSONB NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_ed_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_calendar_events" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "google_event_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "is_all_day" BOOLEAN NOT NULL DEFAULT false,
    "raw_json" JSONB NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_course_website_assignments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "course_name" TEXT,
    "name" TEXT NOT NULL,
    "spec_url" TEXT,
    "due_date" TIMESTAMP(3),
    "release_date" TIMESTAMP(3),
    "assignment_type" TEXT,
    "raw_json" JSONB NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_course_website_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_course_website_page_hashes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "last_checked" TIMESTAMP(3) NOT NULL,
    "last_changed" TIMESTAMP(3),

    CONSTRAINT "raw_course_website_page_hashes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_metadata" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "last_synced" TIMESTAMP(3),
    "last_forced" TIMESTAMP(3),
    "needs_unification" BOOLEAN NOT NULL DEFAULT true,
    "initial_backfill_completed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "sync_metadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "session_token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sync_tokens_user_id_service_key" ON "sync_tokens"("user_id", "service");

-- CreateIndex
CREATE UNIQUE INDEX "courses_course_code_term_key" ON "courses"("course_code", "term");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_user_id_course_id_key" ON "enrollments"("user_id", "course_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_assignments_user_id_assignment_id_key" ON "user_assignments"("user_id", "assignment_id");

-- CreateIndex
CREATE UNIQUE INDEX "canvas_announcements_canvas_id_key" ON "canvas_announcements"("canvas_id");

-- CreateIndex
CREATE UNIQUE INDEX "ed_threads_ed_thread_id_key" ON "ed_threads"("ed_thread_id");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_events_user_id_google_event_id_key" ON "calendar_events"("user_id", "google_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "unified_mismatches_content_hash_key" ON "unified_mismatches"("content_hash");

-- CreateIndex
CREATE UNIQUE INDEX "user_overrides_unified_id_field_key" ON "user_overrides"("unified_id", "field");

-- CreateIndex
CREATE UNIQUE INDEX "raw_api_snapshots_user_id_service_key" ON "raw_api_snapshots"("user_id", "service");

-- CreateIndex
CREATE UNIQUE INDEX "raw_canvas_courses_user_id_canvas_course_id_key" ON "raw_canvas_courses"("user_id", "canvas_course_id");

-- CreateIndex
CREATE UNIQUE INDEX "raw_canvas_assignments_user_id_canvas_assignment_id_key" ON "raw_canvas_assignments"("user_id", "canvas_assignment_id");

-- CreateIndex
CREATE UNIQUE INDEX "raw_canvas_submissions_user_id_canvas_assignment_id_key" ON "raw_canvas_submissions"("user_id", "canvas_assignment_id");

-- CreateIndex
CREATE UNIQUE INDEX "raw_canvas_announcements_user_id_canvas_announcement_id_key" ON "raw_canvas_announcements"("user_id", "canvas_announcement_id");

-- CreateIndex
CREATE UNIQUE INDEX "raw_gradescope_courses_user_id_gradescope_id_key" ON "raw_gradescope_courses"("user_id", "gradescope_id");

-- CreateIndex
CREATE UNIQUE INDEX "raw_gradescope_assignments_user_id_gradescope_id_course_gra_key" ON "raw_gradescope_assignments"("user_id", "gradescope_id", "course_gradescope_id");

-- CreateIndex
CREATE UNIQUE INDEX "raw_ed_threads_user_id_ed_thread_id_key" ON "raw_ed_threads"("user_id", "ed_thread_id");

-- CreateIndex
CREATE UNIQUE INDEX "raw_calendar_events_user_id_google_event_id_key" ON "raw_calendar_events"("user_id", "google_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "raw_course_website_page_hashes_user_id_course_id_key" ON "raw_course_website_page_hashes"("user_id", "course_id");

-- CreateIndex
CREATE UNIQUE INDEX "sync_metadata_user_id_source_key" ON "sync_metadata"("user_id", "source");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_provider_account_id_key" ON "accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_session_token_key" ON "sessions"("session_token");

-- AddForeignKey
ALTER TABLE "sync_tokens" ADD CONSTRAINT "sync_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_assignments" ADD CONSTRAINT "user_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_assignments" ADD CONSTRAINT "user_assignments_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvas_announcements" ADD CONSTRAINT "canvas_announcements_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ed_threads" ADD CONSTRAINT "ed_threads_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_logs" ADD CONSTRAINT "sync_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_api_snapshots" ADD CONSTRAINT "raw_api_snapshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_canvas_courses" ADD CONSTRAINT "raw_canvas_courses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_canvas_assignments" ADD CONSTRAINT "raw_canvas_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_canvas_submissions" ADD CONSTRAINT "raw_canvas_submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_canvas_announcements" ADD CONSTRAINT "raw_canvas_announcements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_gradescope_courses" ADD CONSTRAINT "raw_gradescope_courses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_gradescope_assignments" ADD CONSTRAINT "raw_gradescope_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_ed_threads" ADD CONSTRAINT "raw_ed_threads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_calendar_events" ADD CONSTRAINT "raw_calendar_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_course_website_assignments" ADD CONSTRAINT "raw_course_website_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_course_website_page_hashes" ADD CONSTRAINT "raw_course_website_page_hashes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
