'use client'

import { useEffect } from 'react'

export default function CalendarError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Calendar error:', error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-96 bg-[#0A0A0A] gap-4">
      <p className="text-sm text-[#A3A3A3]">Something went wrong loading your calendar.</p>
      <button
        onClick={reset}
        className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
      >
        Try again
      </button>
    </div>
  )
}
