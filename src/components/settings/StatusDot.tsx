'use client';

export default function StatusDot({ connected }: { connected: boolean }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${
        connected ? "bg-emerald-500" : "bg-[#525252]"
      }`}
    />
  );
}
