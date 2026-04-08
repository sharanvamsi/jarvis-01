'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface Step {
  text: string;
  link?: { label: string; href: string };
}

interface Props {
  steps: Step[];
  defaultOpen?: boolean;
}

export default function SetupGuide({ steps, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs text-[#525252] hover:text-[#A3A3A3] transition-colors"
      >
        Setup instructions
        <ChevronDown
          className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <ol className="mt-2 bg-[#0A0A0A] border border-[#1F1F1F] rounded p-3 space-y-1.5">
          {steps.map((step, i) => (
            <li key={i} className="text-[#A3A3A3] text-xs flex gap-2">
              <span className="text-[#525252] shrink-0">{i + 1}.</span>
              <span>
                {step.text}
                {step.link && (
                  <>
                    {' '}
                    <a
                      href={step.link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 underline"
                    >
                      {step.link.label}
                    </a>
                  </>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
