'use client';

import { useState, useEffect } from 'react';
import { Check, X, Globe, Loader2 } from 'lucide-react';
import SetupGuide from './SetupGuide';

type CourseData = {
  id: string;
  courseCode: string;
  courseName: string;
  websiteUrl: string | null;
};

const SETUP_STEPS = [
  { text: 'Enter the URL for each course\'s website (e.g., cs61b.org)' },
  { text: 'Not all courses have a dedicated website — leave blank if none' },
  { text: 'The pipeline will sync assignments, office hours, and staff info from the website' },
];

export default function CourseWebsitesCard() {
  const [courses, setCourses] = useState<CourseData[]>([]);
  const [loading, setLoading] = useState(true);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch('/api/courses')
      .then((r) => r.ok ? r.json() : Promise.reject(new Error('Failed to fetch courses')))
      .then((data) => {
        const c = data.courses ?? [];
        setCourses(c);
        const init: Record<string, string> = {};
        for (const course of c) {
          init[course.id] = course.websiteUrl ?? '';
        }
        setUrls(init);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleSave(courseId: string) {
    setSaving(courseId);
    setSaved((p) => ({ ...p, [courseId]: false }));
    setErrors((p) => ({ ...p, [courseId]: '' }));

    try {
      const res = await fetch(`/api/courses/${courseId}/website`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urls[courseId] || null }),
      });

      if (res.ok) {
        setSaved((p) => ({ ...p, [courseId]: true }));
        setTimeout(() => setSaved((p) => ({ ...p, [courseId]: false })), 2000);
      } else {
        const data = await res.json();
        setErrors((p) => ({ ...p, [courseId]: data.error ?? 'Failed' }));
      }
    } catch {
      setErrors((p) => ({ ...p, [courseId]: 'Network error' }));
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return (
      <div className="bg-[#111111] border border-[#1F1F1F] rounded-md p-5 mb-4">
        <div className="flex items-center gap-2">
          <Globe className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-[#F5F5F5] text-sm font-medium">Course Websites</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#111111] border border-[#1F1F1F] rounded-md p-5 mb-4">
      <div className="flex items-center gap-2 mb-1">
        <Globe className="w-3.5 h-3.5 text-blue-400" />
        <span className="text-[#F5F5F5] text-sm font-medium">Course Websites</span>
      </div>
      <p className="text-[#525252] text-xs mb-4">
        Add website URLs for your courses to sync assignments and staff info
      </p>

      {courses.length === 0 ? (
        <p className="text-[#525252] text-xs">
          Connect Canvas first to see your courses here.
        </p>
      ) : (
        <div className="space-y-3">
          {courses.map((course) => (
            <div key={course.id}>
              <label className="text-[#F5F5F5] text-xs font-medium block mb-1">
                {course.courseCode}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="url"
                  value={urls[course.id] ?? ''}
                  onChange={(e) => {
                    setUrls((p) => ({ ...p, [course.id]: e.target.value }));
                    setErrors((p) => ({ ...p, [course.id]: '' }));
                  }}
                  placeholder="https://cs61b.org"
                  className="flex-1 bg-[#0A0A0A] border border-[#1F1F1F] rounded text-[#F5F5F5] text-sm px-3 py-1.5 placeholder-[#525252] outline-none focus:border-blue-500 transition-colors"
                />
                <button
                  onClick={() => handleSave(course.id)}
                  disabled={saving === course.id}
                  className="bg-[#1F1F1F] hover:bg-[#2a2a2a] text-[#A3A3A3] text-sm px-3 py-1.5 rounded transition-colors shrink-0 disabled:opacity-50"
                >
                  {saving === course.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : saved[course.id] ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    'Save'
                  )}
                </button>
              </div>
              {errors[course.id] && (
                <p className="text-red-400 text-xs mt-1 flex items-center gap-1">
                  <X className="w-3 h-3" /> {errors[course.id]}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <SetupGuide steps={SETUP_STEPS} />
    </div>
  );
}
