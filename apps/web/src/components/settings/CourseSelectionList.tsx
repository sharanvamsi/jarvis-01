'use client';

export interface CourseCandidate {
  canvasId: string;
  courseCode: string;
  courseName: string;
  term: string;
  selected?: boolean | null;
}

interface Props {
  courses: CourseCandidate[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export default function CourseSelectionList({ courses, selectedIds, onChange }: Props) {
  const allSelected = courses.length > 0 && courses.every(c => selectedIds.includes(c.canvasId));

  return (
    <div className="space-y-2">
      <div className="flex gap-3 mb-3">
        <button
          type="button"
          onClick={() => onChange(courses.map(c => c.canvasId))}
          className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
        >
          Select all
        </button>
        <button
          type="button"
          onClick={() => onChange([])}
          className="text-xs text-[#525252] hover:text-[#A3A3A3] transition-colors"
        >
          Clear all
        </button>
      </div>

      {courses.map(course => (
        <label
          key={course.canvasId}
          className={`flex items-start gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
            selectedIds.includes(course.canvasId)
              ? 'bg-[#111111] border-blue-500/30'
              : 'bg-[#0A0A0A] border-[#1F1F1F] hover:border-[#333]'
          }`}
        >
          <input
            type="checkbox"
            checked={selectedIds.includes(course.canvasId)}
            onChange={e => {
              if (e.target.checked) {
                onChange([...selectedIds, course.canvasId]);
              } else {
                onChange(selectedIds.filter(id => id !== course.canvasId));
              }
            }}
            className="mt-0.5 accent-blue-500"
          />
          <div className="min-w-0">
            <p className="text-sm text-[#F5F5F5] font-medium">{course.courseCode}</p>
            <p className="text-xs text-[#A3A3A3] truncate">{course.courseName}</p>
          </div>
        </label>
      ))}
    </div>
  );
}
