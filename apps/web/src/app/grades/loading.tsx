export default function GradesLoading() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-20 md:pb-0">
      <div className="max-w-[1400px] mx-auto p-4 md:p-8">
        <div className="h-9 w-32 bg-[#111111] rounded animate-pulse mb-6" />
        <div className="flex gap-2 mb-6 border-b border-[#1F1F1F] pb-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-8 w-24 bg-[#111111] rounded animate-pulse" />
          ))}
        </div>
        <div className="h-5 w-72 bg-[#111111] rounded animate-pulse mb-6" />
        <div className="bg-[#111111] border border-[#1F1F1F] rounded-md h-[200px] animate-pulse mb-6" />
        <div className="h-6 w-36 bg-[#111111] rounded animate-pulse mb-3" />
        <div className="bg-[#111111] border border-[#1F1F1F] rounded-md h-[100px] animate-pulse mb-6" />
        <div className="h-6 w-44 bg-[#111111] rounded animate-pulse mb-3" />
        <div className="space-y-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-12 bg-[#111111] border border-[#1F1F1F] rounded-md animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
