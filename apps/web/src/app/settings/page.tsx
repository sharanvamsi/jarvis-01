"use client";

import { useSession, signOut } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { ArrowDown, LogOut } from "lucide-react";
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
  const searchParams = useSearchParams();
  const isSemesterHandoff = searchParams.get("semesterHandoff") === "1";

  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-20 md:pb-0">
      <div className="max-w-[720px] mx-auto p-4 md:p-8">
        <h1 className="text-[28px] font-medium text-[#F5F5F5] mb-8">
          Settings
        </h1>

        {isSemesterHandoff && (
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-md p-4 mb-6">
            <p className="text-sm font-medium text-[#F5F5F5]">A new semester was detected</p>
            <p className="text-xs text-[#A3A3A3] mt-1">
              Review the newly discovered courses below. Your previous semester stays in history and will no longer feed the dashboard.
            </p>
            <div className="flex items-center gap-1.5 text-xs text-blue-400 mt-3">
              <ArrowDown className="w-3.5 h-3.5" /> Select your current courses
            </div>
          </div>
        )}

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
