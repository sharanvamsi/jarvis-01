import { EdQuestion } from '@/lib/types';
import { getCourseColor } from '@/lib/courseColors';
import { SourceBadge } from '@/components/ui/SourceBadge';
import { MessageCircle, ThumbsUp } from 'lucide-react';

type EdQuestionCardProps = {
  question: EdQuestion;
  url?: string | null;
};

export function EdQuestionCard({ question, url }: EdQuestionCardProps) {
  const courseColor = getCourseColor(question.courseCode);

  const truncatedContent =
    question.contentPreview.length > 120
      ? question.contentPreview.slice(0, 120) + '...'
      : question.contentPreview;

  const card = (
    <div className={`bg-[#111111] border border-[#1F1F1F] rounded p-4 hover:bg-[#161616] transition-colors${url ? ' cursor-pointer' : ''}`}>
      <div className="flex items-center gap-2 mb-2">
        <span
          className="px-2 py-0.5 rounded text-xs font-medium"
          style={{ backgroundColor: `${courseColor}20`, color: courseColor }}
        >
          {question.courseCode}
        </span>
        <SourceBadge source="ed-question" />
      </div>
      <div className="text-[#F5F5F5] text-sm mb-1">{question.title}</div>
      <div className="text-[#A3A3A3] text-xs mb-2">{truncatedContent}</div>
      <div className="flex items-center gap-3 text-xs">
        <div className="flex items-center gap-1 text-[#A3A3A3]">
          <MessageCircle className="w-3.5 h-3.5" />
          <span>{question.answerCount}</span>
        </div>
        <div className="flex items-center gap-1 text-[#A3A3A3]">
          <ThumbsUp className="w-3.5 h-3.5" />
          <span>{question.voteCount}</span>
        </div>
        {question.isAnswered && (
          <span className="px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Answered
          </span>
        )}
        {question.linkedAssignment && (
          <span className="text-[#525252]">re: {question.linkedAssignment}</span>
        )}
      </div>
    </div>
  );

  if (url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block">
        {card}
      </a>
    );
  }

  return card;
}
