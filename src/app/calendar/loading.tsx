export default function CalendarLoading() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-20 md:pb-0">
      <div className="max-w-[1400px] mx-auto p-4 md:p-8">
        <div className="flex items-center justify-between mb-6">
          <div className="h-9 w-36 bg-[#111111] rounded animate-pulse" />
          <div className="h-5 w-40 bg-[#111111] rounded animate-pulse" />
        </div>
        <div className="flex items-center gap-2 mb-4">
          <div className="h-8 w-8 bg-[#111111] rounded animate-pulse" />
          <div className="h-8 w-8 bg-[#111111] rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-7 gap-2 mb-2">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="text-center">
              <div className="h-4 w-8 mx-auto bg-[#111111] rounded animate-pulse mb-1" />
              <div className="h-6 w-6 mx-auto bg-[#111111] rounded animate-pulse" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-2 mb-8">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="min-h-[140px] bg-[#111111] border border-[#1F1F1F] rounded-md animate-pulse" />
          ))}
        </div>
        <div className="h-6 w-32 bg-[#111111] rounded animate-pulse mb-3" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-[#111111] border border-[#1F1F1F] rounded-md animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
