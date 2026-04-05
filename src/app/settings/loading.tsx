export default function SettingsLoading() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] p-6 md:p-8">
      <div className="h-8 w-32 bg-[#111111] rounded animate-pulse mb-6" />
      <div className="space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 bg-[#111111] border border-[#1F1F1F] rounded-md animate-pulse" />
        ))}
      </div>
    </div>
  )
}
