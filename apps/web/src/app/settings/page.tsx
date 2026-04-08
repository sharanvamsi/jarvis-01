"use client";

import { useSession, signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import CanvasCard from "@/components/settings/CanvasCard";
import EdCard from "@/components/settings/EdCard";
import GradescopeCard from "@/components/settings/GradescopeCard";
import GoogleCalendarCard from "@/components/settings/GoogleCalendarCard";
import CourseWebsitesCard from "@/components/settings/CourseWebsitesCard";
import CourseManagementCard from "@/components/settings/CourseManagementCard";
import SyllabusUploadCard from "@/components/settings/SyllabusUploadCard";
import DeleteAccountSection from "@/components/settings/DeleteAccountSection";

export default function Settings() {
  const { data: session } = useSession();

  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-20 md:pb-0">
      <div className="max-w-[720px] mx-auto p-4 md:p-8">
        <h1 className="text-[28px] font-medium text-[#F5F5F5] mb-8">
          Settings
        </h1>

        {/* Account */}
        {session?.user && (
          <div className="bg-[#111111] border border-[#1F1F1F] rounded-md p-6 mb-8">
            <h2 className="text-[#F5F5F5] text-sm font-medium mb-4">
              Account
            </h2>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {session.user.image ? (
                  <img
                    src={session.user.image}
                    alt=""
                    className="w-10 h-10 rounded-full"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-medium">
                    {session.user.name?.[0] || "?"}
                  </div>
                )}
                <div>
                  <div className="text-[#F5F5F5] text-sm font-medium">
                    {session.user.name}
                  </div>
                  <div className="text-[#A3A3A3] text-xs">
                    {session.user.email}
                  </div>
                </div>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: "/onboarding" })}
                className="flex items-center gap-2 px-3 py-1.5 rounded text-sm text-[#A3A3A3] hover:text-[#F5F5F5] hover:bg-[#161616] transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          </div>
        )}

        {/* Courses */}
        <h2 className="text-[#F5F5F5] text-sm font-medium mb-4">
          Courses
        </h2>
        <CourseManagementCard />

        {/* Data Sources */}
        <h2 className="text-[#F5F5F5] text-sm font-medium mb-4 mt-8">
          Data Sources
        </h2>
        <CanvasCard />
        <GoogleCalendarCard />
        <GradescopeCard />
        <EdCard />
        <CourseWebsitesCard />

        {/* Syllabus */}
        <h2 className="text-[#F5F5F5] text-sm font-medium mb-4 mt-8">
          Syllabus
        </h2>
        <SyllabusUploadCard />

        {/* Danger Zone */}
        <DeleteAccountSection />
      </div>
    </div>
  );
}
