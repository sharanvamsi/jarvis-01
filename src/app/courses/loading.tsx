export default function CoursesLoading() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] p-6 md:p-8">
      <div className="h-8 w-40 bg-[#111111] rounded animate-pulse mb-6" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-32 bg-[#111111] border border-[#1F1F1F] rounded-md animate-pulse" />
        ))}
      </div>
    </div>
  )
}
