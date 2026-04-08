"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { MobileHeader } from "./MobileHeader";

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isOnboarding = pathname === "/onboarding";

  if (isOnboarding) {
    return <main>{children}</main>;
  }

  return (
    <>
      <Sidebar />
      <MobileHeader />
      <main className="md:pl-60 pt-14 md:pt-0">{children}</main>
    </>
  );
}
