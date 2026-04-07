export default function SettingsLoading() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-20 md:pb-0">
      <div className="max-w-[720px] mx-auto p-4 md:p-8">
        <div className="h-9 w-32 bg-[#111111] rounded animate-pulse mb-8" />
        <div className="bg-[#111111] border border-[#1F1F1F] rounded-md p-6 mb-8 animate-pulse">
          <div className="h-4 w-20 bg-[#1F1F1F] rounded mb-4" />
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#1F1F1F]" />
            <div>
              <div className="h-4 w-40 bg-[#1F1F1F] rounded mb-1" />
              <div className="h-3 w-52 bg-[#1F1F1F] rounded" />
            </div>
          </div>
        </div>
        <div className="h-4 w-28 bg-[#111111] rounded animate-pulse mb-4" />
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="bg-[#111111] border border-[#1F1F1F] rounded-md p-5 mb-4 animate-pulse">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-[#1F1F1F]" />
              <div className="h-4 w-32 bg-[#1F1F1F] rounded" />
            </div>
            <div className="h-3 w-64 bg-[#1F1F1F] rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
