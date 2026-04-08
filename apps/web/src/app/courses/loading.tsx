export default function CoursesLoading() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-20 md:pb-0">
      <div className="max-w-[1400px] mx-auto p-4 md:p-8">
        <div className="flex gap-3 mb-8 overflow-hidden">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex-1 min-w-[160px] bg-[#111111] border border-[#1F1F1F] rounded-md p-4 h-[72px] animate-pulse" />
          ))}
        </div>
        <div className="flex items-center gap-3 mb-1">
          <div className="h-8 w-24 bg-[#111111] rounded animate-pulse" />
          <div className="h-5 w-12 bg-[#111111] rounded animate-pulse" />
        </div>
        <div className="h-5 w-80 bg-[#111111] rounded animate-pulse mb-4" />
        <div className="flex gap-4 mb-6 border-b border-[#1F1F1F] pb-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-6 w-24 bg-[#111111] rounded animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-[#111111] border border-[#1F1F1F] rounded-md p-4 h-[72px] animate-pulse" />
          ))}
        </div>
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1 space-y-3">
            <div className="h-6 w-44 bg-[#111111] rounded animate-pulse" />
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-14 bg-[#111111] border border-[#1F1F1F] rounded-md animate-pulse" />
            ))}
          </div>
          <div className="w-full lg:w-[380px] space-y-3">
            <div className="h-6 w-48 bg-[#111111] rounded animate-pulse" />
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-[#111111] border border-[#1F1F1F] rounded-md animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
