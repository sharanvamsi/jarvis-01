import Link from "next/link";

export const metadata = {
  title: "Privacy Policy - Jarvis",
  description: "How Jarvis collects, stores, and uses your data.",
};

export default function Privacy() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#F5F5F5]">
      <div className="max-w-2xl mx-auto px-6 py-20">
        <Link
          href="/welcome"
          className="text-[13px] text-[#525252] hover:text-[#A3A3A3] transition-colors"
        >
          &larr; Back to home
        </Link>

        <h1 className="text-3xl font-bold mt-6 mb-2">Privacy Policy</h1>
        <p className="text-[#525252] text-sm mb-12">
          Last updated: April 2026
        </p>

        <div className="space-y-10 text-sm leading-relaxed text-[#A3A3A3]">
          <section>
            <h2 className="text-[#F5F5F5] text-lg font-semibold mb-3">
              What data we collect
            </h2>
            <p className="mb-3">
              Jarvis collects only the data necessary to display your academic
              information in one place. This includes:
            </p>
            <ul className="list-disc list-inside space-y-1.5 pl-1">
              <li>
                <strong className="text-[#F5F5F5]">Google account info</strong>{" "}
                &mdash; name, email, and profile photo via Google OAuth for
                authentication
              </li>
              <li>
                <strong className="text-[#F5F5F5]">Canvas API token</strong>{" "}
                &mdash; provided by you to fetch assignments, grades, and
                announcements from bCourses
              </li>
              <li>
                <strong className="text-[#F5F5F5]">
                  Gradescope credentials
                </strong>{" "}
                &mdash; email and password to fetch submission statuses and
                rubric scores
              </li>
              <li>
                <strong className="text-[#F5F5F5]">Ed Discussion API token</strong>{" "}
                &mdash; provided by you to fetch threads and announcements
              </li>
              <li>
                <strong className="text-[#F5F5F5]">
                  Google Calendar events
                </strong>{" "}
                &mdash; read-only access to display your class schedule
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-[#F5F5F5] text-lg font-semibold mb-3">
              How we store your data
            </h2>
            <p>
              All data is stored in a Neon PostgreSQL database. Service
              credentials (Canvas token, Gradescope password, Ed token) are
              encrypted at rest using AES-256-GCM before being written to the
              database. Authentication sessions are managed by NextAuth with
              secure, HTTP-only cookies.
            </p>
          </section>

          <section>
            <h2 className="text-[#F5F5F5] text-lg font-semibold mb-3">
              What we do with your data
            </h2>
            <p>
              Jarvis uses your data exclusively to display it back to you in a
              unified dashboard. We never modify, submit, or delete anything in
              your upstream services (Canvas, Gradescope, Ed, Google Calendar).
              We never sell, share, or provide your data to third parties for
              advertising or marketing purposes.
            </p>
          </section>

          <section>
            <h2 className="text-[#F5F5F5] text-lg font-semibold mb-3">
              Third-party services
            </h2>
            <p className="mb-3">
              Jarvis relies on the following third-party services to operate:
            </p>
            <ul className="list-disc list-inside space-y-1.5 pl-1">
              <li>
                <strong className="text-[#F5F5F5]">Vercel</strong> &mdash; web
                application hosting
              </li>
              <li>
                <strong className="text-[#F5F5F5]">Railway</strong> &mdash;
                data sync pipeline hosting
              </li>
              <li>
                <strong className="text-[#F5F5F5]">Neon</strong> &mdash;
                PostgreSQL database hosting
              </li>
              <li>
                <strong className="text-[#F5F5F5]">Anthropic (Claude)</strong>{" "}
                &mdash; used solely for extracting structured data from public
                course websites (e.g., office hours, exam dates). No personal
                student data is sent to this service.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-[#F5F5F5] text-lg font-semibold mb-3">
              Data retention
            </h2>
            <p>
              Sync logs are automatically pruned after 90 days. Raw sync data is
              removed after 180 days. Active course data is retained for the
              duration of the semester and cleaned up when no longer needed.
            </p>
          </section>

          <section>
            <h2 className="text-[#F5F5F5] text-lg font-semibold mb-3">
              Account deletion
            </h2>
            <p>
              You can delete your account at any time from the Settings page.
              When you delete your account, all of your data &mdash; including
              synced courses, assignments, grades, stored credentials, and
              calendar events &mdash; is permanently and irreversibly removed
              from our database.
            </p>
          </section>

          <section>
            <h2 className="text-[#F5F5F5] text-lg font-semibold mb-3">
              Cookies
            </h2>
            <p>
              Jarvis uses a single session cookie managed by NextAuth to keep
              you signed in. We do not use any tracking cookies, analytics
              scripts, or third-party advertising pixels.
            </p>
          </section>

          <section>
            <h2 className="text-[#F5F5F5] text-lg font-semibold mb-3">
              Contact
            </h2>
            <p>
              If you have questions about this privacy policy or your data,
              contact us at{" "}
              <a
                href="mailto:sharanvamsi@berkeley.edu"
                className="text-blue-500 hover:text-blue-400 transition-colors"
              >
                sharanvamsi@berkeley.edu
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
