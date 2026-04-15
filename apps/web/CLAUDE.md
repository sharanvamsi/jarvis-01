@AGENTS.md
# Jarvis Web — Claude Code Guide

## Project Overview
Next.js 15 + Tailwind dashboard for Berkeley students.
Shows assignments, grades, announcements, office hours,
calendar events from Canvas, Gradescope, Ed, Google Calendar,
course websites.

## Critical Design Rules
NEVER change these design tokens:
- Page bg: bg-[#0A0A0A]
- Card bg: bg-[#111111]
- Border: border-[#1F1F1F]
- Primary text: text-[#F5F5F5]
- Secondary text: text-[#A3A3A3]
- Tertiary text: text-[#525252]
- Accent: blue-500 (#3B82F6)
- Success/submitted: emerald-500 (#10B981)
- Warning/due soon: amber-500 (#F59E0B)
- Danger/missing: red-500 (#EF4444)
- Hover: bg-[#161616]
- Border radius: rounded-md (6px) cards, rounded (4px) badges

NEVER calculate grades. Show raw scores only (87/100).
Grade calculation requires syllabus weights which we don't have.

NEVER mix Canvas announcements with Ed threads. They are
separate entities surfaced differently in the UI.

## Architecture Decisions
- Shared data: one Course/Assignment/Announcement row per course,
  all students benefit
- Personal data: UserAssignment (scores), Enrollment,
  CalendarEvent — one per user
- Raw layer: source-faithful tables written by workers
- Unified layer: computed from raw, dashboard reads these
- currentSemester comes from user.currentSemester, never hardcoded

## Course badge colors (consistent across all pages)
- CS 162 → blue (#3B82F6)
- CS 189 → purple (#8B5CF6)
- UGBA 102A → amber (#F59E0B)
- UGBA 103 → emerald (#10B981)
- Default → gray (#6B7280)

## Stack
- Next.js 15 App Router + TypeScript
- Tailwind CSS (no component library)
- Prisma + Neon PostgreSQL
- lucide-react for icons
- recharts for grade charts
- zustand for client state

## File Structure
src/
  app/
    page.tsx              — dashboard home
    courses/
      page.tsx            — all courses
      [id]/page.tsx       — course detail with tabs
    grades/page.tsx       — raw scores, no calculations
    calendar/page.tsx     — week view + class schedule
    settings/page.tsx     — connect data sources
    onboarding/page.tsx   — first-time setup
  components/
    ui/
      ScoreBadge.tsx      — graded/submitted/missing/late/ungraded
      SourceBadge.tsx     — Canvas/Gradescope/Ed/Website pills
    dashboard/
      AssignmentCard.tsx  — with ScoreBadge
      AnnouncementCard.tsx — Canvas announcements with SourceBadge
      EdAnnouncementCard.tsx — Ed instructor posts
      EdQuestionCard.tsx  — Ed questions with vote/answer counts
      ClassCard.tsx       — Today's classes from calendar
      ExamCard.tsx        — Upcoming exams
      OfficeHoursCard.tsx — Office hours
      StatCard.tsx        — Dashboard stat cards
      WelcomeBanner.tsx   — Welcome header
    courses/
      CoursesClient.tsx
      CourseDetailClient.tsx
    grades/
      GradesClient.tsx
    calendar/
      CalendarClient.tsx
    layout/
      Sidebar.tsx
      MobileHeader.tsx
  lib/
    mockData.ts           — all mock data, types defined here

## Prisma client import
Always import from "@/generated/prisma/client" not "@prisma/client"

## Rules
- No component libraries (no shadcn, no MUI, no Chakra)
- Pure Tailwind only
- No gradients, no shadows, flat surfaces with borders
- Hover states: bg-[#161616]
- All data fetching in Server Components where possible
- All pages use real Prisma data via src/lib/data.ts
- Mobile responsive: sidebar collapses to bottom nav below 768px
- Keep components small and focused, one job each

## Running the App
npm run dev               — start dev server on localhost:3000
npm run build             — production build, must pass clean

## Environment Variables Needed
DATABASE_URL              — Neon pooled connection string
DIRECT_URL                — Neon direct connection string
GOOGLE_CLIENT_ID          — Google OAuth
GOOGLE_CLIENT_SECRET      — Google OAuth
NEXTAUTH_SECRET           — NextAuth session secret
NEXTAUTH_URL              — http://localhost:3000 in dev
ENCRYPTION_KEY            — 64-char hex for AES-256-GCM
ANTHROPIC_API_KEY         — For course website LLM extraction

## Common Errors and Fixes
- "Cannot find module @prisma/client" → run npx prisma generate
- Type errors on mockData → check types match component props
- Build fails on missing env → add to .env.local for dev

## Data Flow (implemented)
All pages use requireAuth() from @/lib/data
All data queries are in src/lib/data.ts
Real data is fetched server-side in page.tsx
Components receive typed Prisma objects (not mock types)

## Token Management
Canvas token: POST/DELETE /api/tokens/canvas
Ed token: POST/DELETE /api/tokens/ed
Gradescope: POST/DELETE /api/tokens/gradescope
Status check: GET /api/tokens/[service]/status
Encryption: shared utility at src/lib/encrypt.ts (AES-256-GCM)

## Empty States
When data source not connected: show CTA to /settings
When data empty (no records): show descriptive empty state
Never crash on empty arrays — always ?? []

## Common Patterns
Get user in page: const user = await requireAuth()
Get courses: const courses = await getUserCourses(user.id)
Format date: new Date(date).toLocaleDateString('en-US', {...})
Get first userAssignment: assignment.userAssignments?.[0]

## Dashboard Layout (current)
Left column (top to bottom):
  1. Due Soon — future assignments only, sorted nearest first
  2. Updates — tabbed: Announcements (Canvas + Ed staff) | Questions (Ed)
  3. Missing Assignments — collapsible, amber header, past due, dismissible

Right column:
  1. Today's Events (from Google Calendar, links to Google Calendar)
  2. Office Hours Today
  3. Upcoming Exams

## Data Rules
- Due Soon: dueDate >= now, sorted asc, 14-day window
- Missing: dueDate < now AND status not submitted/graded
- Course Updates: Canvas announcements + Ed threadType=announcement
  merged and sorted by postedAt/createdAt desc
- Student Questions: Ed threadType=question, sorted by
  (voteCount + answerCount) desc

## Google Calendar
- OAuth tokens stored in Account table (NextAuth)
  NOT in SyncToken table
- Requires calendar.readonly scope in Google OAuth config
- Token refresh handled by calendar worker
- Berkeley Time = startTime + 10 minutes
- Status API: GET /api/tokens/google/status

## Client vs Server Components — Auth Rule
signIn() and signOut() from next-auth/react ONLY work in
client components ("use client").
Never call them in server components or server actions.
Always create a separate client component for auth buttons.

Pattern:
  src/components/auth/SomeAuthButton.tsx  <- "use client"
  Import and render in server page/component

## Assignment Card Variants (Dashboard)
upcoming (Due Soon): shows PointsBadge (X pts), daysUntil due date
missing: shows "Xd overdue" in red, no points
graded: shows score (X/Y)

## Announcement Sorting
Canvas: sort by postedAt DESC (actual instructor post date)
Ed: sort by postedAt DESC (actual thread creation date on Ed)
Merged: sort by postedAt DESC after mapping Ed.postedAt -> postedAt
Never sort by syncedAt or DB createdAt

## Google Calendar Auth Flow
POST /api/tokens/google/revoke deletes the Account record
and revokes the access token with Google. This forces the
next signIn to show a fresh consent screen with calendar scope.
If Google still skips the calendar prompt, user must manually
revoke at myaccount.google.com/permissions, then Reconnect.

## Ed Tab Visibility
Ed tab only shows if course.edCourseId !== null AND
edThreads.length > 0.
UGBA courses have no Ed — tab does not appear for them.
Ed threads fetched with take:200 in getCourseById.

## HTML Stripping
Canvas announcement bodies contain raw HTML.
Always run through stripHtml() from src/lib/utils.ts before rendering.
Applied in page.tsx courseUpdates merge for Canvas announcements.

## Course Colors
getCourseColor is in src/lib/courseColors.ts
Do NOT import from mockData — use courseColors.
Known colors: CS=blue, CS 189=purple, UGBA 102A=amber, UGBA 103=green

## Dashboard Right Column Layout
1. Today's Events (Google Calendar)
2. Office Hours Today (course websites)
3. Upcoming Exams (course websites)
All three sections show empty states gracefully.
OfficeHoursCard and ExamCard accept real Prisma types.

## Course Website Data Models
OfficeHour, Exam, CourseStaff, SyllabusWeek — related to Course.
Populated by jarvis-pipeline courseWebsite worker.
getCourseById includes all four in its query.
