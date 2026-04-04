import Link from 'next/link';

export function MobileHeader() {
  return (
    <div className="md:hidden fixed top-0 left-0 right-0 bg-[#0A0A0A] border-b border-[#1F1F1F] px-4 py-3 z-40">
      <Link href="/" className="flex items-center gap-2">
        <div className="w-7 h-7 rounded bg-[#3B82F6] flex items-center justify-center">
          <span className="text-white text-sm font-semibold">J</span>
        </div>
        <span className="text-[#F5F5F5] font-semibold">Jarvis</span>
      </Link>
    </div>
  );
}
