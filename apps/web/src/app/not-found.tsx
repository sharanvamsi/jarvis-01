import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-8">
      <div className="text-center">
        <h1 className="text-6xl font-medium text-[#F5F5F5] mb-4">404</h1>
        <p className="text-[#A3A3A3] mb-8">Page not found</p>
        <Link
          href="/"
          className="inline-block px-6 py-3 bg-[#3B82F6] text-white rounded hover:bg-[#2563EB] transition-colors"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
