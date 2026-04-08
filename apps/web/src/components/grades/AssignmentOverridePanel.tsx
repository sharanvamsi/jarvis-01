'use client';

import { useState, useTransition, useEffect } from 'react';
import { X, RotateCcw, EyeOff, Eye, ChevronDown } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface AssignmentData {
  id: string;
  name: string;
  assignmentType: string;
  pointsPossible: number | null;
  dueDate: string | null;
  groupName: string | null;
  override: {
    excludeFromCalc: boolean;
    overrideMaxScore: number | null;
    overrideDueDate: string | null;
    overrideGroupId: string | null;
    overrideGroupName: string | null;
  } | null;
}

interface ComponentGroupData {
  id: string;
  name: string;
  weight: number;
}

interface Props {
  courseCode: string;
  courseId: string;
  assignments: AssignmentData[];
  componentGroups: ComponentGroupData[];
  onClose: () => void;
}

export default function AssignmentOverridePanel({
  courseCode,
  courseId,
  assignments,
  componentGroups,
  onClose,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Trigger slide-in animation on mount
    requestAnimationFrame(() => setIsOpen(true));
  }, []);

  const [showAddForm, setShowAddForm] = useState(false)
  const [newAssignment, setNewAssignment] = useState({
    name: '',
    pointsPossible: '',
    score: '',
    dueDate: '',
    groupId: '',
  })
  const [addSaving, setAddSaving] = useState(false)

  function deriveAssignmentType(groupId: string): string {
    if (!groupId) return 'other'
    const group = componentGroups.find(g => g.id === groupId)
    if (!group) return 'other'
    const name = group.name.toLowerCase()
    if (name.includes('exam') || name.includes('midterm') || name.includes('final')) return 'exam'
    if (name.includes('lab')) return 'lab'
    if (name.includes('project')) return 'project'
    return 'homework'
  }

  async function handleAddAssignment() {
    if (!newAssignment.name.trim()) return
    setAddSaving(true)
    setMutationError(null)
    try {
      const res = await fetch('/api/assignments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId,
          name: newAssignment.name.trim(),
          pointsPossible: newAssignment.pointsPossible
            ? parseFloat(newAssignment.pointsPossible)
            : null,
          score: newAssignment.score
            ? parseFloat(newAssignment.score)
            : null,
          dueDate: newAssignment.dueDate || null,
          groupId: newAssignment.groupId || null,
          assignmentType: deriveAssignmentType(newAssignment.groupId),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setMutationError(err.error ?? 'Failed to add assignment')
        return
      }
      setNewAssignment({
        name: '',
        pointsPossible: '',
        score: '',
        dueDate: '',
        groupId: '',
      })
      setShowAddForm(false)
      startTransition(() => router.refresh())
    } catch {
      setMutationError('Network error — could not add assignment')
    } finally {
      setAddSaving(false)
    }
  }

  const [edits, setEdits] = useState<Record<string, {
    excludeFromCalc: boolean;
    overrideMaxScore: string;
    overrideDueDate: string;
    overrideGroupId: string;
  }>>(() => {
    const initial: Record<string, {
      excludeFromCalc: boolean;
      overrideMaxScore: string;
      overrideDueDate: string;
      overrideGroupId: string;
    }> = {};
    for (const a of assignments) {
      initial[a.id] = {
        excludeFromCalc: a.override?.excludeFromCalc ?? false,
        overrideMaxScore: a.override?.overrideMaxScore?.toString() ?? '',
        overrideDueDate: a.override?.overrideDueDate?.slice(0, 10) ?? '',
        overrideGroupId: a.override?.overrideGroupId ?? '',
      };
    }
    return initial;
  });

  const hasOverride = (assignmentId: string, original: AssignmentData) => {
    const edit = edits[assignmentId];
    return (
      edit?.excludeFromCalc ||
      (edit?.overrideMaxScore !== '' &&
        parseFloat(edit.overrideMaxScore) !== original.pointsPossible) ||
      edit?.overrideDueDate !== '' ||
      edit?.overrideGroupId !== ''
    );
  };

  async function saveOverride(assignmentId: string, overrideEdits?: typeof edits[string]) {
    setSaving(assignmentId);
    setMutationError(null);
    const edit = overrideEdits ?? edits[assignmentId];
    // Handle __exclude__ selection from group dropdown (B6)
    const isExcludeViaGroup = edit.overrideGroupId === '__exclude__';
    try {
      const res = await fetch('/api/assignments/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignmentId,
          excludeFromCalc: isExcludeViaGroup ? true : edit.excludeFromCalc,
          overrideMaxScore: edit.overrideMaxScore !== ''
            ? parseFloat(edit.overrideMaxScore)
            : null,
          overrideDueDate: edit.overrideDueDate || null,
          overrideGroupId: isExcludeViaGroup ? null : (edit.overrideGroupId || null),
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setMutationError(err.error ?? 'Failed to save override');
        return;
      }
      // Sync local state if __exclude__ was selected
      if (isExcludeViaGroup) {
        setEdits(prev => ({
          ...prev,
          [assignmentId]: {
            ...prev[assignmentId],
            excludeFromCalc: true,
            overrideGroupId: '',
          }
        }));
      }
      startTransition(() => router.refresh());
    } catch {
      setMutationError('Network error — could not save override');
    } finally {
      setSaving(null);
    }
  }

  async function resetOverride(assignmentId: string) {
    setSaving(assignmentId);
    setMutationError(null);
    try {
      const res = await fetch('/api/assignments/override', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignmentId })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setMutationError(err.error ?? 'Failed to reset override');
        return;
      }
      setEdits(prev => ({
        ...prev,
        [assignmentId]: {
          excludeFromCalc: false,
          overrideMaxScore: '',
          overrideDueDate: '',
          overrideGroupId: '',
        }
      }));
      startTransition(() => router.refresh());
    } catch {
      setMutationError('Network error — could not reset override');
    } finally {
      setSaving(null);
    }
  }

  async function resetAllOverrides() {
    setSaving('all');
    setMutationError(null);
    try {
      const res = await fetch('/api/assignments/override/reset-all', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setMutationError(err.error ?? 'Failed to reset all overrides');
        return;
      }
      const reset: Record<string, {
        excludeFromCalc: boolean;
        overrideMaxScore: string;
        overrideDueDate: string;
        overrideGroupId: string;
      }> = {};
      for (const a of assignments) {
        reset[a.id] = {
          excludeFromCalc: false,
          overrideMaxScore: '',
          overrideDueDate: '',
          overrideGroupId: '',
        };
      }
      setEdits(reset);
      startTransition(() => router.refresh());
    } catch {
      setMutationError('Network error — could not reset overrides');
    } finally {
      setSaving(null);
    }
  }

  const overrideCount = assignments.filter(a =>
    hasOverride(a.id, a)
  ).length;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />

      {/* Panel */}
      <div className={`fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-[#111111] border-l border-[#1F1F1F] flex flex-col shadow-2xl transition-transform duration-300 ease-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1F1F1F]">
          <div>
            <h2 className="text-sm font-medium text-[#F5F5F5]">
              Assignment Overrides — {courseCode}
            </h2>
            <p className="text-xs text-[#525252] mt-0.5">
              {overrideCount > 0
                ? `${overrideCount} override${overrideCount !== 1 ? 's' : ''} active`
                : 'No overrides — showing source data'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {overrideCount > 0 && (
              <button
                onClick={resetAllOverrides}
                disabled={saving === 'all'}
                className="text-xs text-[#525252] hover:text-amber-400 transition-colors flex items-center gap-1"
              >
                <RotateCcw size={11} />
                Reset all
              </button>
            )}
            <button onClick={onClose} className="text-[#525252] hover:text-[#A3A3A3]">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Mutation error banner */}
        {mutationError && (
          <div className="mx-4 mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded flex items-center justify-between">
            <span className="text-xs text-red-400">{mutationError}</span>
            <button onClick={() => setMutationError(null)} className="text-red-400 hover:text-red-300 ml-2 shrink-0">
              <X size={12} />
            </button>
          </div>
        )}

        {/* Assignment list */}
        <div className="flex-1 overflow-y-auto">
          {[...assignments].sort((a, b) => {
            const aEx = edits[a.id]?.excludeFromCalc ? 1 : 0;
            const bEx = edits[b.id]?.excludeFromCalc ? 1 : 0;
            return aEx - bEx;
          }).map(assignment => {
            const edit = edits[assignment.id];
            const isExpanded = expandedId === assignment.id;
            const isSaving = saving === assignment.id;
            const isOverridden = hasOverride(assignment.id, assignment);

            return (
              <div
                key={assignment.id}
                className={`border-b border-[#1F1F1F] ${
                  edit?.excludeFromCalc ? 'opacity-50' : ''
                }`}
              >
                {/* Assignment row */}
                <div className="flex items-center gap-2 px-4 py-2.5">
                  {/* Exclude toggle */}
                  <button
                    onClick={() => {
                      const newExclude = !edits[assignment.id].excludeFromCalc;
                      const newEdit = {
                        ...edits[assignment.id],
                        excludeFromCalc: newExclude,
                      };
                      setEdits(prev => ({
                        ...prev,
                        [assignment.id]: newEdit,
                      }));
                      // Auto-save immediately (B5)
                      saveOverride(assignment.id, newEdit);
                    }}
                    title={edit?.excludeFromCalc
                      ? 'Excluded from grade calculation'
                      : 'Included in grade calculation'}
                    className="shrink-0 text-[#525252] hover:text-[#A3A3A3] transition-colors"
                  >
                    {edit?.excludeFromCalc
                      ? <EyeOff size={13} className="text-amber-500" />
                      : <Eye size={13} />
                    }
                  </button>

                  {/* Name */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs truncate ${
                      edit?.excludeFromCalc
                        ? 'text-[#525252] line-through'
                        : 'text-[#F5F5F5]'
                    }`}>
                      {assignment.name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-[#525252]">
                        {edit?.overrideGroupId
                          ? componentGroups.find(g => g.id === edit.overrideGroupId)?.name
                          : assignment.groupName ?? 'unmatched'}
                      </span>
                      {isOverridden && (
                        <span className="text-[10px] text-amber-500/70 bg-amber-500/10 rounded px-1">
                          modified
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Expand/actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isOverridden && (
                      <button
                        onClick={() => resetOverride(assignment.id)}
                        disabled={isSaving}
                        className="text-[10px] text-[#525252] hover:text-[#A3A3A3]"
                        title="Reset to source data"
                      >
                        <RotateCcw size={11} />
                      </button>
                    )}
                    <button
                      onClick={() => setExpandedId(
                        isExpanded ? null : assignment.id
                      )}
                      className="text-[#525252] hover:text-[#A3A3A3]"
                    >
                      <ChevronDown
                        size={13}
                        className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      />
                    </button>
                  </div>
                </div>

                {/* Expanded edit form */}
                {isExpanded && (
                  <div className="px-4 pb-3 bg-[#0D0D0D] space-y-2.5">

                    {/* Override max score */}
                    <div className="flex items-center gap-3">
                      <label className="text-[11px] text-[#525252] w-24 shrink-0">
                        Points possible
                      </label>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-[#525252]">
                          {assignment.pointsPossible ?? '—'}
                        </span>
                        <span className="text-[11px] text-[#525252]">&rarr;</span>
                        <input
                          type="number"
                          value={edit?.overrideMaxScore}
                          onChange={e => setEdits(prev => ({
                            ...prev,
                            [assignment.id]: {
                              ...prev[assignment.id],
                              overrideMaxScore: e.target.value
                            }
                          }))}
                          placeholder={assignment.pointsPossible?.toString() ?? 'unchanged'}
                          className="w-20 bg-[#161616] border border-[#1F1F1F] rounded px-2 py-1 text-xs text-[#F5F5F5] placeholder-[#525252]"
                        />
                      </div>
                    </div>

                    {/* Override due date */}
                    <div className="flex items-center gap-3">
                      <label className="text-[11px] text-[#525252] w-24 shrink-0">
                        Due date
                      </label>
                      <input
                        type="date"
                        value={edit?.overrideDueDate}
                        onChange={e => setEdits(prev => ({
                          ...prev,
                          [assignment.id]: {
                            ...prev[assignment.id],
                            overrideDueDate: e.target.value
                          }
                        }))}
                        className="bg-[#161616] border border-[#1F1F1F] rounded px-2 py-1 text-xs text-[#F5F5F5]"
                      />
                    </div>

                    {/* Override group */}
                    <div className="flex items-center gap-3">
                      <label className="text-[11px] text-[#525252] w-24 shrink-0">
                        Grade group
                      </label>
                      <select
                        value={edit?.overrideGroupId}
                        onChange={e => setEdits(prev => ({
                          ...prev,
                          [assignment.id]: {
                            ...prev[assignment.id],
                            overrideGroupId: e.target.value
                          }
                        }))}
                        className="flex-1 bg-[#161616] border border-[#1F1F1F] rounded px-2 py-1 text-xs text-[#F5F5F5]"
                      >
                        <option value="">
                          {assignment.groupName ?? 'unmatched (auto)'}
                        </option>
                        {componentGroups.map(g => (
                          <option key={g.id} value={g.id}>
                            {g.name} ({(g.weight * 100).toFixed(0)}%)
                          </option>
                        ))}
                        <option value="__exclude__">
                          Exclude from calculation
                        </option>
                      </select>
                    </div>

                    {/* Save button */}
                    <div className="flex justify-end pt-1">
                      <button
                        onClick={() => saveOverride(assignment.id)}
                        disabled={isSaving}
                        className="text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded px-3 py-1.5 transition-colors"
                      >
                        {isSaving ? 'Saving...' : 'Save changes'}
                      </button>
                    </div>

                    {/* Source of truth reference */}
                    <div className="pt-1 border-t border-[#1F1F1F]">
                      <p className="text-[10px] text-[#525252]">
                        Source: {assignment.assignmentType} •{' '}
                        {assignment.pointsPossible != null
                          ? `${assignment.pointsPossible} pts`
                          : 'no points'} •{' '}
                        {assignment.dueDate
                          ? new Date(assignment.dueDate).toLocaleDateString()
                          : 'no due date'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Add assignment section */}
        <div className="border-t border-[#1F1F1F] p-4">
          {!showAddForm ? (
            <button
              onClick={() => setShowAddForm(true)}
              className="w-full text-xs text-[#525252] hover:text-[#A3A3A3] border border-dashed border-[#1F1F1F] hover:border-[#333] rounded py-2 transition-colors"
            >
              + Add assignment manually
            </button>
          ) : (
            <div className="space-y-2.5">
              <p className="text-xs font-medium text-[#F5F5F5]">Add assignment</p>

              <input
                type="text"
                value={newAssignment.name}
                onChange={e => setNewAssignment(p => ({ ...p, name: e.target.value }))}
                placeholder="Assignment name"
                className="w-full bg-[#161616] border border-[#1F1F1F] rounded px-3 py-1.5 text-xs text-[#F5F5F5] placeholder-[#525252]"
              />

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-[#525252] mb-1 block">Score</label>
                  <input
                    type="number"
                    value={newAssignment.score}
                    onChange={e => setNewAssignment(p => ({ ...p, score: e.target.value }))}
                    placeholder="85"
                    className="w-full bg-[#161616] border border-[#1F1F1F] rounded px-2 py-1.5 text-xs text-[#F5F5F5] placeholder-[#525252]"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-[#525252] mb-1 block">Out of</label>
                  <input
                    type="number"
                    value={newAssignment.pointsPossible}
                    onChange={e => setNewAssignment(p => ({ ...p, pointsPossible: e.target.value }))}
                    placeholder="100"
                    className="w-full bg-[#161616] border border-[#1F1F1F] rounded px-2 py-1.5 text-xs text-[#F5F5F5] placeholder-[#525252]"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] text-[#525252] mb-1 block">Due date</label>
                <input
                  type="date"
                  value={newAssignment.dueDate}
                  onChange={e => setNewAssignment(p => ({ ...p, dueDate: e.target.value }))}
                  className="w-full bg-[#161616] border border-[#1F1F1F] rounded px-2 py-1.5 text-xs text-[#F5F5F5]"
                />
              </div>

              <div>
                <label className="text-[10px] text-[#525252] mb-1 block">Grade group</label>
                <select
                  value={newAssignment.groupId}
                  onChange={e => setNewAssignment(p => ({ ...p, groupId: e.target.value }))}
                  className="w-full bg-[#161616] border border-[#1F1F1F] rounded px-2 py-1.5 text-xs text-[#F5F5F5]"
                >
                  <option value="">No group (untracked)</option>
                  {componentGroups.map(g => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({(g.weight * 100).toFixed(0)}%)
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleAddAssignment}
                  disabled={addSaving || !newAssignment.name.trim()}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs rounded px-3 py-1.5 transition-colors"
                >
                  {addSaving ? 'Adding...' : 'Add assignment'}
                </button>
                <button
                  onClick={() => setShowAddForm(false)}
                  className="text-xs text-[#525252] hover:text-[#A3A3A3] px-3 py-1.5"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-[#1F1F1F]">
          <p className="text-[11px] text-[#525252] text-center">
            Changes affect your grade calculation only.
            Source data is preserved and always restorable.
          </p>
        </div>
      </div>
    </>
  );
}
