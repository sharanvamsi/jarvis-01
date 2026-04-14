import Link from "next/link";

export const metadata = {
  title: "Terms of Service - Jarvis",
  description: "Terms and conditions for using Jarvis.",
};

export default function Terms() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#F5F5F5]">
      <div className="max-w-2xl mx-auto px-6 py-20">
        <Link
          href="/welcome"
          className="text-[13px] text-[#525252] hover:text-[#A3A3A3] transition-colors"
        >
          &larr; Back to home
        </Link>

        <h1 className="text-3xl font-bold mt-6 mb-2">Terms of Service</h1>
        <p className="text-[#525252] text-sm mb-12">
          Last updated: April 2026
        </p>

        <div className="space-y-10 text-sm leading-relaxed text-[#A3A3A3]">
          <section>
            <h2 className="text-[#F5F5F5] text-lg font-semibold mb-3">
              Service description
            </h2>
            <p>
              Jarvis is a free academic dashboard built for UC Berkeley students.
              It aggregates data from Canvas (bCourses), Gradescope, Ed
              Discussion, Google Calendar, and public course websites into a
              single interface. Jarvis is not affiliated with or endorsed by UC
              Berkeley, Instructure, Gradescope, or Ed Discussion.
            </p>
          </section>

          <section>
            <h2 className="text-[#F5F5F5] text-lg font-semibold mb-3">
              Account requirements
            </h2>
            <p>
              To use Jarvis you must have a Google account and be a UC Berkeley
              student with access to bCourses. You are responsible for
              maintaining the security of your account and any API tokens or
              credentials you provide to the service.
            </p>
          </section>

          <section>
            <h2 className="text-[#F5F5F5] text-lg font-semibold mb-3">
              Acceptable use
            </h2>
            <p className="mb-3">
              Jarvis is intended for personal academic use only. You agree not
              to:
            </p>
            <ul className="list-disc list-inside space-y-1.5 pl-1">
              <li>
                Share your Jarvis account or connected service credentials with
                others
              </li>
              <li>
                Use the service to access or display another student&apos;s
                academic data
              </li>
              <li>
                Attempt to overload, reverse-engineer, or interfere with the
                service
              </li>
              <li>
                Use the service for any purpose other than viewing your own
                academic information
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-[#F5F5F5] text-lg font-semibold mb-3">
              Data accuracy
            </h2>
            <p>
              Jarvis displays data as received from your connected services. We
              do not guarantee the accuracy, completeness, or timeliness of any
              information shown. Jarvis is not a substitute for checking bCourses,
              Gradescope, or Ed directly. Always verify important deadlines,
              grades, and announcements with the original source.
            </p>
          </section>

          <section>
            <h2 className="text-[#F5F5F5] text-lg font-semibold mb-3">
              Limitation of liability
            </h2>
            <p>
              Jarvis is provided &ldquo;as is&rdquo; without warranties of any
              kind, express or implied. We are not liable for any damages
              arising from your use of the service, including but not limited to
              missed assignments, incorrect grade displays, or data
              synchronization delays. Use of Jarvis is at your own risk.
            </p>
          </section>

          <section>
            <h2 className="text-[#F5F5F5] text-lg font-semibold mb-3">
              Termination
            </h2>
            <p>
              We reserve the right to suspend or terminate accounts that violate
              these terms or use the service in ways that could harm other users
              or the service itself. You may delete your account at any time
              from the Settings page, which permanently removes all your data.
            </p>
          </section>

          <section>
            <h2 className="text-[#F5F5F5] text-lg font-semibold mb-3">
              Changes to these terms
            </h2>
            <p>
              We may update these terms from time to time. The &ldquo;Last
              updated&rdquo; date at the top of this page reflects the most
              recent revision. Continued use of Jarvis after changes are posted
              constitutes acceptance of the updated terms.
            </p>
          </section>

          <section>
            <h2 className="text-[#F5F5F5] text-lg font-semibold mb-3">
              Contact
            </h2>
            <p>
              If you have questions about these terms, contact us at{" "}
              <a
                href="mailto:jarvis@berkeley.edu"
                className="text-blue-500 hover:text-blue-400 transition-colors"
              >
                jarvis@berkeley.edu
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
