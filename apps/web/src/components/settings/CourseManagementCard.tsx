'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Globe, Loader2, Plus, X } from 'lucide-react';

interface CourseEntry {
  canvasId: string;
  courseCode: string;
  courseName: string;
  term: string;
  selected: boolean | null;
}

export default function CourseManagementCard() {
  const router = useRouter();
  const [allCourses, setAllCourses] = useState<CourseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [canvasConnected, setCanvasConnected] = useState(false);
  const [showAddCourse, setShowAddCourse] = useState(false);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [justRemoved, setJustRemoved] = useState<string | null>(null);
  // canvasId → DB course ID mapping (from selections API)
  const [courseIdMap, setCourseIdMap] = useState<Record<string, string>>({});
  // Inline website URL input for just-added course
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [savingWebsite, setSavingWebsite] = useState(false);
  const [websiteSaved, setWebsiteSaved] = useState(false);

  const fetchCourses = useCallback(async () => {
    setLoading(true);
    try {
      const statusRes = await fetch('/api/tokens/canvas/status');
      const statusData = await statusRes.json();
      setCanvasConnected(statusData.connected);
      if (!statusData.connected) { setLoading(false); return; }

      const res = await fetch('/api/courses/candidates');
      if (!res.ok) { setLoading(false); return; }
      const data = await res.json();
      setAllCourses(data.courses ?? []);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCourses(); }, [fetchCourses]);

  const selectedCourses = allCourses.filter(c => c.selected === true);
  const availableCourses = allCourses.filter(c => c.selected !== true);

  async function saveSelections(newSelectedIds: string[]) {
    setSaving(true);
    try {
      const res = await fetch('/api/courses/selections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedCanvasIds: newSelectedIds }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.courseMap) {
          setCourseIdMap(prev => ({ ...prev, ...data.courseMap }));
        }
        // Update local state immediately
        setAllCourses(prev => prev.map(c => ({
          ...c,
          selected: newSelectedIds.includes(c.canvasId) ? true : false,
        })));
        router.refresh();
      }
    } catch { /* ignore */ } finally {
      setSaving(false);
    }
  }

  async function handleAddCourse(canvasId: string) {
    const newIds = [...selectedCourses.map(c => c.canvasId), canvasId];
    setWebsiteUrl('');
    setWebsiteSaved(false);
    setJustAdded(canvasId);
    await saveSelections(newIds);
    setShowAddCourse(false);
  }

  async function handleSaveWebsite() {
    if (!justAdded || !websiteUrl.trim()) return;
    const courseId = courseIdMap[justAdded];
    if (!courseId) return;

    setSavingWebsite(true);
    try {
      const res = await fetch(`/api/courses/${courseId}/website`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: websiteUrl.trim() }),
      });
      if (res.ok) {
        setWebsiteSaved(true);
        setTimeout(() => {
          setJustAdded(null);
          setWebsiteUrl('');
          setWebsiteSaved(false);
        }, 1500);
      }
    } catch { /* ignore */ } finally {
      setSavingWebsite(false);
    }
  }

  function handleDismissWebsite() {
    setJustAdded(null);
    setWebsiteUrl('');
    setWebsiteSaved(false);
  }

  async function handleRemoveCourse(canvasId: string) {
    const newIds = selectedCourses
      .map(c => c.canvasId)
      .filter(id => id !== canvasId);
    if (newIds.length === 0) return; // must keep at least 1
    setJustRemoved(canvasId);
    await saveSelections(newIds);
    setTimeout(() => setJustRemoved(null), 2000);
  }

  if (loading) {
    return (
      <div className="bg-[#111111] border border-[#1F1F1F] rounded-md p-5 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#525252]" />
          <span className="text-[#F5F5F5] text-sm font-medium">Your Courses</span>
        </div>
      </div>
    );
  }

  if (!canvasConnected) {
    return (
      <div className="bg-[#111111] border border-[#1F1F1F] rounded-md p-5 mb-4 opacity-60">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[#F5F5F5] text-sm font-medium">Your Courses</span>
          <span className="text-[10px] text-[#525252] bg-[#1F1F1F] rounded px-1.5 py-0.5">Requires Canvas</span>
        </div>
        <p className="text-xs text-[#525252]">Connect Canvas first to manage your course selection.</p>
      </div>
    );
  }

  return (
    <div className="bg-[#111111] border border-[#1F1F1F] rounded-md p-5 mb-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[#F5F5F5] text-sm font-medium">Your Courses</span>
        {saving && <Loader2 className="w-3.5 h-3.5 text-[#525252] animate-spin" />}
      </div>
      <p className="text-[#525252] text-xs mb-4">
        Only selected courses are synced to your dashboard.
      </p>

      {/* Selected courses */}
      {selectedCourses.length === 0 && !showAddCourse ? (
        <p className="text-[#525252] text-sm mb-3">No courses selected yet.</p>
      ) : (
        <div className="space-y-2 mb-3">
          {selectedCourses.map(course => (
            <div
              key={course.canvasId}
              className={`flex items-center justify-between p-3 rounded-md border transition-colors ${
                justAdded === course.canvasId
                  ? 'bg-emerald-500/10 border-emerald-500/30'
                  : 'bg-[#0A0A0A] border-[#1F1F1F]'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="text-sm text-[#F5F5F5] font-medium">{course.courseCode}</span>
                <span className="text-xs text-[#525252] truncate">{course.courseName}</span>
              </div>
              <button
                onClick={() => handleRemoveCourse(course.canvasId)}
                disabled={saving || selectedCourses.length <= 1}
                className="text-[#525252] hover:text-red-400 disabled:opacity-30 transition-colors shrink-0 ml-2"
                title="Remove course"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add course button / expanded list */}
      {!showAddCourse ? (
        <button
          onClick={() => setShowAddCourse(true)}
          disabled={availableCourses.length === 0}
          className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 disabled:text-[#525252] transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          {availableCourses.length > 0
            ? `Add course (${availableCourses.length} available)`
            : 'No more courses available'}
        </button>
      ) : (
        <div className="mt-2 border border-[#1F1F1F] rounded-md p-3 bg-[#0A0A0A]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-[#A3A3A3] font-medium">Select a course to add</span>
            <button
              onClick={() => setShowAddCourse(false)}
              className="text-[#525252] hover:text-[#A3A3A3] transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
            {availableCourses.map(course => (
              <button
                key={course.canvasId}
                onClick={() => handleAddCourse(course.canvasId)}
                disabled={saving}
                className="w-full text-left p-2.5 rounded border border-[#1F1F1F] hover:border-blue-500/30 hover:bg-[#111111] disabled:opacity-50 transition-colors"
              >
                <p className="text-sm text-[#F5F5F5] font-medium">{course.courseCode}</p>
                <p className="text-xs text-[#525252] truncate">{course.courseName}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Inline website URL prompt after adding a course */}
      {justAdded && (
        <div className="mt-3 border border-[#1F1F1F] rounded-md p-3 bg-[#0A0A0A]">
          <p className="text-emerald-400 text-xs flex items-center gap-1 mb-2">
            <Check className="w-3 h-3" /> Course added — syncing data now
          </p>
          {!websiteSaved ? (
            <>
              <p className="text-[#A3A3A3] text-xs mb-2">
                Does this course have a website? Adding it lets us sync assignments, office hours, and staff.
              </p>
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-2 bg-[#111111] border border-[#1F1F1F] rounded px-2.5 py-1.5">
                  <Globe className="w-3.5 h-3.5 text-[#525252] shrink-0" />
                  <input
                    type="url"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    placeholder="https://cs61b.org"
                    className="flex-1 bg-transparent text-sm text-[#F5F5F5] placeholder-[#525252] outline-none"
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveWebsite()}
                  />
                </div>
                <button
                  onClick={handleSaveWebsite}
                  disabled={!websiteUrl.trim() || savingWebsite}
                  className="px-3 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 transition-colors"
                >
                  {savingWebsite ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
                </button>
                <button
                  onClick={handleDismissWebsite}
                  className="text-[#525252] hover:text-[#A3A3A3] transition-colors"
                  title="Skip"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </>
          ) : (
            <p className="text-emerald-400 text-xs flex items-center gap-1">
              <Check className="w-3 h-3" /> Website saved
            </p>
          )}
        </div>
      )}
      {justRemoved && (
        <p className="text-[#A3A3A3] text-xs mt-2">Course removed</p>
      )}
    </div>
  );
}
