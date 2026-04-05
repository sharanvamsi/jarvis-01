'use client';

import { LayoutDashboard, BookOpen, GraduationCap, Calendar, Settings } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
  { icon: BookOpen, label: 'Courses', path: '/courses' },
  { icon: GraduationCap, label: 'Grades', path: '/grades' },
  { icon: Calendar, label: 'Calendar', path: '/calendar' },
  { icon: Settings, label: 'Settings', path: '/settings' },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const userName = session?.user?.name ?? 'Student';
  const userInitial = userName[0]?.toUpperCase() ?? 'U';
  const userEmail = session?.user?.email ?? '';

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden md:block fixed left-0 top-0 h-screen w-60 border-r border-[#1F1F1F] bg-[#0A0A0A] z-50">
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-6 border-b border-[#1F1F1F]">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded bg-[#3B82F6] flex items-center justify-center">
                <span className="text-white text-sm font-semibold">J</span>
              </div>
              <span className="text-[#F5F5F5] font-semibold">Jarvis</span>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 overflow-y-auto">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.path;

              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className={`
                    flex items-center gap-3 px-3 py-2 rounded mb-1 text-sm transition-colors relative
                    ${isActive
                      ? 'bg-[#111111] text-[#F5F5F5]'
                      : 'text-[#A3A3A3] hover:bg-[#161616] hover:text-[#F5F5F5]'
                    }
                  `}
                >
                  {isActive && (
                    <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-[#3B82F6] rounded-r" />
                  )}
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* User info */}
          <div className="p-4 border-t border-[#1F1F1F]">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#3B82F6] flex items-center justify-center text-white text-sm font-medium">
                {userInitial}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[#F5F5F5] text-sm font-medium truncate">{userName}</div>
                <div className="text-[#A3A3A3] text-xs truncate">
                  {userEmail.includes('berkeley.edu') ? 'UC Berkeley' : userEmail}
                </div>
              </div>
              <div className="w-2 h-2 rounded-full bg-[#10B981]" />
            </div>
          </div>
        </div>
      </div>

      {/* Mobile bottom navigation */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 border-t border-[#1F1F1F] bg-[#0A0A0A] z-50">
        <nav className="flex items-center justify-around">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.path;

            return (
              <Link
                key={item.path}
                href={item.path}
                className={`
                  flex flex-col items-center gap-1 py-3 px-4 transition-colors flex-1
                  ${isActive ? 'text-[#3B82F6]' : 'text-[#A3A3A3]'}
                `}
              >
                <Icon className="w-5 h-5" />
                <span className="text-xs">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </>
  );
}
