export default function RootLoading() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-20 md:pb-0">
      <div className="max-w-[1400px] mx-auto p-4 md:p-8">
        {/* Greeting */}
        <div className="h-9 w-64 bg-[#111111] rounded animate-pulse mb-1" />
        <div className="h-5 w-48 bg-[#111111] rounded animate-pulse mb-6" />

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-[#111111] border border-[#1F1F1F] rounded-md p-4 h-[88px] animate-pulse" />
          ))}
        </div>

        {/* Two-column layout */}
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1 space-y-4">
            <div className="h-6 w-28 bg-[#111111] rounded animate-pulse" />
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="bg-[#111111] border border-[#1F1F1F] rounded-md p-4 h-[72px] animate-pulse" />
            ))}
          </div>
          <div className="w-full lg:w-[380px] space-y-4">
            <div className="h-6 w-32 bg-[#111111] rounded animate-pulse" />
            <div className="bg-[#111111] border border-[#1F1F1F] rounded-md p-4 h-[60px] animate-pulse" />
            <div className="h-6 w-36 bg-[#111111] rounded animate-pulse mt-4" />
            <div className="bg-[#111111] border border-[#1F1F1F] rounded-md p-4 h-[60px] animate-pulse" />
            <div className="h-6 w-40 bg-[#111111] rounded animate-pulse mt-4" />
            <div className="bg-[#111111] border border-[#1F1F1F] rounded-md p-4 h-[80px] animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}
