# Jarvis Pipeline — Claude Code Guide

## Project Overview
TypeScript background workers that sync data from Canvas,
Gradescope, Ed, Google Calendar, and course websites into
Neon PostgreSQL. Uses BullMQ for job queue.

## Architecture
Workers write to RAW tables (source-faithful).
Unification runs after workers complete.
Unification writes to UNIFIED tables (dashboard reads these).

## Data Flow
Canvas worker → raw_canvas_* tables → unification →
  courses, assignments, user_assignments, canvas_announcements

Gradescope worker → raw_gradescope_* tables → unification →
  assignments (enrich), user_assignments (enrich)

Ed worker → raw_ed_threads → unification → ed_threads

Calendar worker → raw_calendar_events → calendar_events

Course website worker → raw_course_website_assignments →
  unification → assignments (enrich with spec URLs)

## Key Decisions
- currentSemester from user.currentSemester, never hardcoded
- isCurrentCourse() uses term marker matching only,
  not enrollment_state (Canvas marks old courses as active)
- First sync: pull full history → raw tables
- Subsequent syncs: current semester only
- Dirty flag: mark needs_unification after each worker
- Unification runs once after all workers complete
- On API failure: fall back to cached data from DB

## Source Priority in Unification
name: course_website > gradescope > canvas
due_date: gradescope > canvas > course_website
release_date: gradescope > course_website > canvas
assignment_type: course_website > gradescope > canvas
spec_url: course_website only
submission_status: gradescope > canvas

## Canvas Filtering Constants
currentTermMarkers = ["spring 2026", "sp26"]
pastTerms = ["fall 2023", "spring 2024", "fall 2024",
             "spring 2025", "fall 2025"]
nonAcademicNameMarkers = ["orientation", "golden bear",
                          "shape", "advising", "sell out"]
nonAcademicCodePrefixes = ["GBA", "GBO", "GBP", "SHAPE"]

## Assignment Fuzzy Matching
Two assignments match if:
  1. Normalized names have >= 80% word overlap, OR
  2. One name contains the other, OR
  3. Due dates within 24 hours AND names share 2+ tokens
Name normalization: lowercase, strip punctuation,
  expand hw→homework proj→project, strip course prefix

## Department Aliases
COMPSCI → CS
EECS 189 → CS 189
CS 189/289A → CS 189

## Ed Thread Classification
is_announcement=true OR is_pinned=true AND staff author
  → EdThread.threadType = "announcement"
answerCount > 3 OR voteCount > 5 OR isAnswered
  → EdThread.threadType = "question" (surface in UI)
else → store in raw but do not surface

## Course Website Worker (implemented)
- Fetches CS 162 (cs162.org) and CS 189 (eecs189.org/sp26)
- Uses Claude Haiku for structured extraction
- SHA-256 hash prevents unnecessary LLM calls (~$0.006/call)
- Writes to: OfficeHour, Exam, CourseStaff, SyllabusWeek,
  RawCourseWebsiteAssignment, RawCourseWebsitePageHash
- Threshold: 24 hours between syncs
- fetchWithRetry: 3 attempts, 15s timeout, exponential backoff
- validateAssignment: rejects dates not in CURRENT_YEAR
- ANTHROPIC_API_KEY required in .env
- Post-sync enrichment: matches website assignments to unified
  assignments by name and adds specUrl

## File Structure
src/
  workers/
    canvas.ts             — Canvas sync worker
    gradescope.ts         — Gradescope sync worker (calls Python ms)
    ed.ts                 — Ed Discussion sync worker
    calendar.ts           — Google Calendar sync worker
    courseWebsite.ts       — Course website scraper worker
  lib/
    unification/
      courses.ts          — course matching logic
      assignments.ts      — assignment merge logic
      announcements.ts    — Ed thread classification
    normalize.ts          — shared normalization functions
    crypto.ts             — AES-256-GCM encrypt/decrypt
    db.ts                 — Prisma client singleton
    queue.ts              — BullMQ queue setup
  jobs/
    syncUser.ts           — orchestrates all workers for one user
    unifyUser.ts          — runs unification after workers
  index.ts                — worker process entry point

## Ed Worker (implemented)
- Reads edCourseId from Course table (must be seeded manually)
- Known Ed course IDs: CS 162 → 93952, CS 189 → 94609
- Token stored as 'ed' service in SyncToken table
- Threshold: 15 minutes between syncs (via SyncMetadata)
- Classifies threads: announcement / question / ignore
- Writes to: RawEdThread (all), EdThread (announcement + question)
- Thread ID format: ed_{courseId}_{threadId}
- Thread URL: https://edstem.org/us/courses/{id}/discussion/{threadId}

## Clickable Cards
All card components accept optional url prop
If url present: entire card wrapped in <a target="_blank">
If url null: card renders without link wrapper

## Running Workers
npx tsx src/sync-once.ts sync <userId>  — one-off sync
npm run dev                              — start queue worker
npx prisma generate                     — regenerate client

## Calendar Worker (implemented)
- Reads OAuth tokens from Account table (not SyncToken)
- Token refresh: POST to oauth2.googleapis.com/token
- Updates Account.access_token and Account.expires_at after refresh
- Fetches 60 days of events from primary calendar
- Detects class events by matching title to enrolled course codes
- Berkeley Time computed as startTime + 10 minutes
- Requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env
- User must have calendar.readonly OAuth scope (set in jarvis-web auth.ts)

## Environment Variables
DATABASE_URL              — Neon pooled
DIRECT_URL                — Neon direct
ENCRYPTION_KEY            — 64-char hex AES key
ANTHROPIC_API_KEY         — For course website extraction
GRADESCOPE_SERVICE_URL    — URL of Python microservice
REDIS_URL                 — BullMQ Redis connection
GOOGLE_CLIENT_ID          — Google OAuth client ID
GOOGLE_CLIENT_SECRET      — Google OAuth client secret

## Gradescope Worker (implemented)
- Credentials stored encrypted as JSON in SyncToken table
  service='gradescope', accessToken=encrypt(JSON{email,password})
- Calls Python microservice at GRADESCOPE_SERVICE_URL
  Default: http://localhost:8001
  Start: cd gradescope-service && source .venv/bin/activate && python -m uvicorn main:app --port 8001
- Threshold: 6 hours between syncs (via SyncMetadata)
- Matches GS assignments to Canvas by name (assignmentNamesMatch)
- Creates new Assignment rows for GS-only assignments (source='gradescope')
- Updates UserAssignment scores where GS has better data
- Rate limit: 500ms between course syncs
- Known GS course IDs: CS 162 → 1235393, CS 189 → 1229310

## Gradescope Python Microservice
Location: ~/jarvis-pipeline/gradescope-service/
Venv: .venv/ (Python 3.13)
Start locally: source .venv/bin/activate && python -m uvicorn main:app --host 0.0.0.0 --port 8001
Deploy: Railway (Dockerfile included)
Endpoints: POST /courses, POST /assignments, GET /health
Library: gradescopeapi==1.7.0
API shape: course IDs are dict keys, assignments have
  assignment_id, name, submissions_status, grade, max_grade,
  release_date, due_date, late_due_date (all datetime objects)
