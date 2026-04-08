"use client"

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

type CollapsibleSectionProps = {
  title: string
  count: number
  defaultOpen?: boolean
  headerClassName?: string
  children: React.ReactNode
}

export function CollapsibleSection({
  title,
  count,
  defaultOpen = false,
  headerClassName = 'text-[#F5F5F5]',
  children,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className="mb-8">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 mb-4 group w-full text-left"
      >
        <h2 className={`text-lg font-medium ${headerClassName}`}>
          {title} ({count})
        </h2>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-[#525252] group-hover:text-[#A3A3A3] transition-colors" />
        ) : (
          <ChevronDown className="w-4 h-4 text-[#525252] group-hover:text-[#A3A3A3] transition-colors" />
        )}
      </button>
      {isOpen && <div className="space-y-3">{children}</div>}
    </div>
  )
}
