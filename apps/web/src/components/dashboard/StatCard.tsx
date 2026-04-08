type StatCardProps = {
  title: string;
  value: string | number;
  subtitle: string;
  subtitleColor?: 'default' | 'warning' | 'danger';
};

export function StatCard({ title, value, subtitle, subtitleColor = 'default' }: StatCardProps) {
  const subtitleClasses = subtitleColor === 'warning'
    ? 'text-amber-500'
    : subtitleColor === 'danger'
      ? 'text-red-500'
      : 'text-[#525252]'

  return (
    <div className="bg-[#111111] border border-[#1F1F1F] rounded-md p-5">
      <div className="text-[#A3A3A3] text-sm mb-2">{title}</div>
      <div className="text-[#F5F5F5] text-3xl font-medium mb-1">{value}</div>
      <div className={`text-xs ${subtitleClasses}`}>{subtitle}</div>
    </div>
  );
}
