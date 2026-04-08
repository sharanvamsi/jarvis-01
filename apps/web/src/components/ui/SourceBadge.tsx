type SourceBadgeProps = {
  source: 'canvas' | 'gradescope' | 'ed' | 'ed-question' | 'website';
};

const sourceConfig = {
  canvas: {
    label: 'Canvas',
    classes: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  },
  gradescope: {
    label: 'GS',
    classes: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  },
  ed: {
    label: 'Ed',
    classes: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  },
  'ed-question': {
    label: 'Ed Q',
    classes: 'bg-purple-500/5 text-purple-400 border-purple-500/20',
  },
  website: {
    label: 'Web',
    classes: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
  },
} as const;

export function SourceBadge({ source }: SourceBadgeProps) {
  const config = sourceConfig[source];

  return (
    <span
      className={`text-xs font-medium px-2 py-0.5 rounded border ${config.classes}`}
    >
      {config.label}
    </span>
  );
}
