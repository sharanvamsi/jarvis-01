'use client'

import { useState } from 'react'

interface Props {
  assignmentName: string
  assignmentId: string
  existingStat?: { mean: number; stdDev: number } | null
  onSaved: (mean: number, stdDev: number) => void
}

export default function ExamStatEntry({
  assignmentName,
  assignmentId,
  existingStat,
  onSaved,
}: Props) {
  const [editing, setEditing] = useState(!existingStat)
  const [mean, setMean] = useState(existingStat?.mean?.toString() ?? '')
  const [stdDev, setStdDev] = useState(existingStat?.stdDev?.toString() ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    const m = parseFloat(mean)
    const s = parseFloat(stdDev)
    if (isNaN(m) || isNaN(s) || s <= 0) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/exam-stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignmentId, mean: m, stdDev: s }),
      })
      if (!res.ok) {
        setError('Failed to save')
        return
      }
      onSaved(m, s)
      setEditing(false)
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  // No stat, not editing — show prominent prompt
  if (!existingStat && !editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="flex items-center gap-1.5 text-xs text-amber-500 hover:text-amber-400 border border-amber-500/20 rounded px-2 py-1 transition-colors"
      >
        <span>{'\u26A0'}</span>
        Enter class statistics
      </button>
    )
  }

  // Has existing stat, not editing — show stat values
  if (!editing && existingStat) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-[#525252]">
          {'\u03BC'}={existingStat.mean} {'\u03C3'}={existingStat.stdDev}
        </span>
        <button
          onClick={() => setEditing(true)}
          className="text-[10px] text-[#525252] hover:text-[#A3A3A3]"
        >
          edit
        </button>
      </div>
    )
  }

  // Editing mode — show form
  return (
    <div className="flex flex-col gap-1.5 p-2 bg-[#161616] border border-[#1F1F1F] rounded">
      <p className="text-[11px] text-[#A3A3A3]">
        Enter from Ed post (e.g. &quot;Mean: 35.69, Std Dev: 10.03&quot;)
      </p>
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-[#525252] w-8">mean</span>
        <input
          type="number"
          value={mean}
          onChange={(e) => setMean(e.target.value)}
          placeholder="78"
          className="w-14 bg-[#0A0A0A] border border-[#1F1F1F] rounded px-1.5 py-0.5 text-xs text-[#F5F5F5] placeholder-[#525252]"
        />
        <span className="text-[11px] text-[#525252] w-6">std</span>
        <input
          type="number"
          value={stdDev}
          onChange={(e) => setStdDev(e.target.value)}
          placeholder="12"
          className="w-14 bg-[#0A0A0A] border border-[#1F1F1F] rounded px-1.5 py-0.5 text-xs text-[#F5F5F5] placeholder-[#525252]"
        />
        <button
          onClick={handleSave}
          disabled={saving || !mean || !stdDev}
          className="text-[11px] text-blue-400 hover:text-blue-300 disabled:opacity-40"
        >
          {saving ? 'saving...' : 'save'}
        </button>
      </div>
      {error && (
        <p className="text-[11px] text-red-400">{error}</p>
      )}
    </div>
  )
}
