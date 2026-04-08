from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional
import traceback
import re

app = FastAPI(title="Jarvis Gradescope Service")

# ── REQUEST/RESPONSE MODELS ──────────────────────────────────

class CoursesRequest(BaseModel):
    email: str
    password: str

class AssignmentsRequest(BaseModel):
    email: str
    password: str
    course_id: str

class CourseModel(BaseModel):
    gradescope_id: str
    short_name: str
    full_name: str
    term: str
    year: str
    role: str

class AssignmentModel(BaseModel):
    gradescope_id: str
    title: str
    release_date: Optional[str] = None
    due_date: Optional[str] = None
    late_due_date: Optional[str] = None
    total_points: Optional[float] = None
    earned_points: Optional[float] = None
    status: Optional[str] = None
    late_info: Optional[str] = None
    submitted: bool = False
    url: Optional[str] = None

# ── HELPERS ───────────────────────────────────────────────────

def parse_submissions_status(status_str: Optional[str]) -> dict:
    """Parse Gradescope submissions_status string."""
    if not status_str:
        return {
            "submitted": False,
            "earned_points": None,
            "total_points": None,
            "late_info": None,
        }

    # Score pattern: "8.0 / 10.0"
    score_match = re.match(r'^([\d.]+)\s*/\s*([\d.]+)', status_str.strip())
    if score_match:
        return {
            "submitted": True,
            "earned_points": float(score_match.group(1)),
            "total_points": float(score_match.group(2)),
            "late_info": None,
        }

    # Late pattern embedded in status like "Submitted2 Days, 17 Hours Late"
    late_match = re.search(
        r'(\d+\s*(?:Day|Hour|Minute|Second)s?(?:,?\s*\d+\s*(?:Day|Hour|Minute|Second)s?)*\s*Late)',
        status_str, re.IGNORECASE
    )
    late_info = late_match.group(1).strip() if late_match else None

    submitted = "submitted" in status_str.lower()
    no_submission = "no submission" in status_str.lower()
    ungraded = status_str.strip().lower() == "ungraded"

    return {
        "submitted": (submitted or ungraded) and not no_submission,
        "earned_points": None,
        "total_points": None,
        "late_info": late_info,
    }

def login_to_gradescope(email: str, password: str):
    """Create and return a logged-in GSConnection."""
    try:
        from gradescopeapi.classes.connection import GSConnection
        conn = GSConnection()
        conn.login(email, password)
        return conn
    except Exception as e:
        raise HTTPException(
            status_code=401,
            detail=f"Gradescope login failed: {str(e)}"
        )

def safe_datetime_str(val) -> Optional[str]:
    """Convert datetime to ISO string."""
    if val is None:
        return None
    try:
        return val.isoformat()
    except Exception:
        return str(val)

# ── ROUTES ────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "service": "gradescope"}

@app.post("/courses")
def get_courses(req: CoursesRequest):
    """Get all courses for a user."""
    conn = login_to_gradescope(req.email, req.password)

    try:
        raw_courses = conn.account.get_courses()
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch courses: {str(e)}"
        )

    courses = []

    for role in ["student", "instructor"]:
        role_courses = raw_courses.get(role, {})
        if isinstance(role_courses, dict):
            items = role_courses.items()
        else:
            items = [(str(i), c) for i, c in enumerate(role_courses)]

        for course_id, course in items:
            try:
                courses.append(CourseModel(
                    gradescope_id=str(course_id),
                    short_name=str(getattr(course, 'name', '')),
                    full_name=str(getattr(course, 'full_name', '') or getattr(course, 'name', '')),
                    term=str(getattr(course, 'semester', '') or getattr(course, 'term', '')),
                    year=str(getattr(course, 'year', '')),
                    role=role,
                ))
            except Exception as e:
                print(f"Warning: could not parse course: {e}")
                continue

    return {"courses": [c.dict() for c in courses]}

@app.post("/assignments")
def get_assignments(req: AssignmentsRequest):
    """Get all assignments for a course."""
    conn = login_to_gradescope(req.email, req.password)

    try:
        raw_assignments = conn.account.get_assignments(req.course_id)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch assignments: {str(e)}"
        )

    assignments = []

    for assignment in (raw_assignments or []):
        try:
            # Parse the submissions_status field
            status_raw = str(getattr(assignment, 'submissions_status', '') or '')
            parsed = parse_submissions_status(status_raw)

            # Grade and max_grade from the object
            grade_val = getattr(assignment, 'grade', None)
            max_grade_val = getattr(assignment, 'max_grade', None)

            earned_pts = parsed.get("earned_points")
            total_pts = parsed.get("total_points")

            # Override with grade/max_grade if they have numeric values
            if grade_val is not None:
                try:
                    earned_pts = float(str(grade_val))
                except (ValueError, TypeError):
                    pass
            if max_grade_val is not None:
                try:
                    total_pts = float(str(max_grade_val))
                except (ValueError, TypeError):
                    pass

            # Get assignment ID — try multiple approaches
            gs_id = ''
            url_attr = getattr(assignment, 'url', '') or ''
            if url_attr:
                # Extract ID from URL path like /courses/123/assignments/456
                parts = url_attr.rstrip('/').split('/')
                gs_id = parts[-1] if parts else ''

            # Also try direct attribute
            if not gs_id:
                gs_id = str(getattr(assignment, 'assignment_id', '') or '')

            # Construct full Gradescope URL using course_id from request
            constructed_url = None
            if gs_id and req.course_id:
                constructed_url = (
                    f"https://www.gradescope.com/courses/"
                    f"{req.course_id}/assignments/{gs_id}"
                )

            assignments.append(AssignmentModel(
                gradescope_id=gs_id,
                title=str(getattr(assignment, 'name', '') or 'Untitled'),
                release_date=safe_datetime_str(getattr(assignment, 'release_date', None)),
                due_date=safe_datetime_str(getattr(assignment, 'due_date', None)),
                late_due_date=safe_datetime_str(getattr(assignment, 'late_due_date', None)),
                total_points=total_pts,
                earned_points=earned_pts,
                status=status_raw or None,
                late_info=parsed.get("late_info"),
                submitted=parsed.get("submitted", False),
                url=constructed_url,
            ))
        except Exception as e:
            print(f"Warning: could not parse assignment: {e}")
            traceback.print_exc()
            continue

    return {
        "assignments": [a.dict() for a in assignments],
        "count": len(assignments),
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
