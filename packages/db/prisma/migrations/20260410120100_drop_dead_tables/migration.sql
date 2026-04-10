-- Drop dead raw tables (never written to by any worker)
DROP TABLE IF EXISTS "raw_canvas_assignments";
DROP TABLE IF EXISTS "raw_canvas_submissions";
DROP TABLE IF EXISTS "raw_canvas_announcements";
DROP TABLE IF EXISTS "raw_ed_threads";
DROP TABLE IF EXISTS "raw_calendar_events";

-- Drop dead metadata tables (never written to or read)
DROP TABLE IF EXISTS "unified_mismatches";
DROP TABLE IF EXISTS "user_overrides";
