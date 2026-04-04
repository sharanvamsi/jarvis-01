'use client';

import { useState, useEffect, useRef } from 'react';
import { Upload, Check, FileText, Loader2 } from 'lucide-react';

type CourseData = {
  id: string;
  courseCode: string;
  hasSyllabus: boolean;
  syllabusSource: string | null;
  syllabusConfirmed: boolean;
};

export default function SyllabusUploadCard() {
  const [courses, setCourses] = useState<CourseData[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeCourseId, setActiveCourseId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/courses')
      .then((r) => r.json())
      .then((data) => {
        setCourses(data.courses ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  function triggerUpload(courseId: string) {
    setActiveCourseId(courseId);
    setError(null);
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !activeCourseId) return;

    setUploading(activeCourseId);
    setError(null);

    try {
      let rawText = '';

      if (file.name.endsWith('.txt')) {
        rawText = await file.text();
      } else if (file.name.endsWith('.pdf')) {
        rawText = await extractPdfText(file);
      } else {
        setError('Unsupported file type. Please upload a .pdf or .txt file.');
        setUploading(null);
        return;
      }

      if (!rawText.trim()) {
        setError('Could not extract text from the file. Try a .txt file instead.');
        setUploading(null);
        return;
      }

      const res = await fetch('/api/syllabus/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId: activeCourseId, rawText }),
      });

      if (res.ok) {
        setUploaded((p) => ({ ...p, [activeCourseId!]: true }));
        setCourses((prev) =>
          prev.map((c) =>
            c.id === activeCourseId
              ? { ...c, hasSyllabus: true, syllabusSource: 'upload', syllabusConfirmed: false }
              : c
          )
        );
      } else {
        setError('Failed to upload syllabus');
      }
    } catch {
      setError('Failed to process file');
    } finally {
      setUploading(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function extractPdfText(file: File): Promise<string> {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pages: string[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ');
      pages.push(text);
    }

    return pages.join('\n\n');
  }

  function statusBadge(course: CourseData) {
    if (uploaded[course.id]) {
      return <span className="text-[10px] text-emerald-400 bg-emerald-500/10 rounded px-1.5 py-0.5">Just uploaded</span>;
    }
    if (course.syllabusConfirmed) {
      return <span className="text-[10px] text-emerald-400 bg-emerald-500/10 rounded px-1.5 py-0.5">Confirmed</span>;
    }
    if (course.hasSyllabus) {
      return <span className="text-[10px] text-amber-400 bg-amber-500/10 rounded px-1.5 py-0.5">Unconfirmed</span>;
    }
    return <span className="text-[10px] text-[#525252]">No syllabus</span>;
  }

  if (loading) {
    return (
      <div className="bg-[#111111] border border-[#1F1F1F] rounded-md p-5 mb-4">
        <div className="flex items-center gap-2">
          <FileText className="w-3.5 h-3.5 text-[#525252]" />
          <span className="text-[#F5F5F5] text-sm font-medium">Upload Syllabus</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#111111] border border-[#1F1F1F] rounded-md p-5 mb-4">
      <div className="flex items-center gap-2 mb-1">
        <FileText className="w-3.5 h-3.5 text-blue-400" />
        <span className="text-[#F5F5F5] text-sm font-medium">Upload Syllabus</span>
      </div>
      <p className="text-[#525252] text-xs mb-4">
        Upload a syllabus PDF or TXT for each course. Then confirm grade weights in the Grades page.
      </p>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.txt"
        onChange={handleFileChange}
        className="hidden"
      />

      {courses.length === 0 ? (
        <p className="text-[#525252] text-xs">
          Connect Canvas first to see your courses here.
        </p>
      ) : (
        <div className="space-y-2">
          {courses.map((course) => (
            <div
              key={course.id}
              className="flex items-center justify-between py-2 border-b border-[#1F1F1F] last:border-0"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[#F5F5F5] text-sm">{course.courseCode}</span>
                {statusBadge(course)}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href="/grades"
                  className="text-xs text-[#525252] hover:text-[#A3A3A3] transition-colors"
                >
                  Edit weights
                </a>
                <button
                  onClick={() => triggerUpload(course.id)}
                  disabled={uploading === course.id}
                  className="flex items-center gap-1.5 bg-[#1F1F1F] hover:bg-[#2a2a2a] text-[#A3A3A3] text-xs px-2.5 py-1.5 rounded transition-colors disabled:opacity-50"
                >
                  {uploading === course.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : uploaded[course.id] ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Upload className="w-3 h-3" />
                  )}
                  {uploading === course.id ? 'Uploading...' : 'Upload'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="text-red-400 text-xs mt-2">{error}</p>
      )}
    </div>
  );
}
