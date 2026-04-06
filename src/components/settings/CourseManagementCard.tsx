'use client';

import { useState, useEffect, useCallback } from 'react';
import { Check, Loader2, RefreshCw } from 'lucide-react';
import CourseSelectionList, { type CourseCandidate } from './CourseSelectionList';

export default function CourseManagementCard() {
  const [courses, setCourses] = useState<CourseCandidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [canvasConnected, setCanvasConnected] = useState(false);

  const fetchCandidates = useCallback(async () => {
    setLoading(true);
    try {
      // Check Canvas status
      const statusRes = await fetch('/api/tokens/canvas/status');
      const statusData = await statusRes.json();
      setCanvasConnected(statusData.connected);
      if (!statusData.connected) { setLoading(false); return; }

      // Fetch course candidates
      const res = await fetch('/api/courses/candidates');
      if (!res.ok) { setLoading(false); return; }
      const data = await res.json();
      const candidates: CourseCandidate[] = data.courses ?? [];
      setCourses(candidates);
      setSelectedIds(
        candidates.filter(c => c.selected === true).map(c => c.canvasId)
      );
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCandidates(); }, [fetchCandidates]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch('/api/courses/selections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedCanvasIds: selectedIds }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
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
        <p className="text-xs text-[#525252]">
          Connect Canvas first to manage your course selection.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-[#111111] border border-[#1F1F1F] rounded-md p-5 mb-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[#F5F5F5] text-sm font-medium">Your Courses</span>
        <button
          onClick={() => { fetchCandidates(); }}
          className="text-[#525252] hover:text-[#A3A3A3] transition-colors"
          title="Refresh course list"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
      <p className="text-[#525252] text-xs mb-4">
        Only selected courses are synced to your dashboard.
      </p>

      {courses.length === 0 ? (
        <p className="text-[#525252] text-sm">
          No active courses found. Try syncing Canvas first.
        </p>
      ) : (
        <>
          <CourseSelectionList
            courses={courses}
            selectedIds={selectedIds}
            onChange={setSelectedIds}
          />

          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={handleSave}
              disabled={selectedIds.length === 0 || saving}
              className="bg-blue-500 hover:bg-blue-600 text-white text-sm px-4 py-2 rounded disabled:bg-[#1F1F1F] disabled:text-[#525252] transition-colors flex items-center gap-2"
            >
              {saving ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...</>
              ) : (
                `Save (${selectedIds.length} course${selectedIds.length !== 1 ? 's' : ''})`
              )}
            </button>
            {saved && (
              <span className="text-emerald-400 text-xs flex items-center gap-1">
                <Check className="w-3 h-3" /> Saved &mdash; syncing now
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
