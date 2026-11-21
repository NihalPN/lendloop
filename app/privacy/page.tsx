import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { SignInButton, Show } from "@clerk/nextjs";

export const metadata: Metadata = {
  title: "Privacy Policy — LendLoop Neighborhood Tool Shed",
  description: "How LendLoop handles member accounts, tool listings, transaction logs, third-party processors, and self-service data deletion.",
};

export default function PrivacyPage() {
  const sections = [
    {
      code: "PRIV-01",
      title: "Data We Collect",
      content:
        "When you register and use LendLoop, we collect your verified name, primary email address, authentication identifiers from our identity provider, tool catalog descriptions, and your borrowing history (reservation dates, return timestamps, and overdue statuses). We do not collect payment card information, precise GPS tracking, or biometric data.",
    },
    {
      code: "PRIV-02",
      title: "How We Use Member Data",
      content:
        "Your information is used solely to coordinate neighborhood tool sharing: validating tool availability, notifying tool owners of reservation requests, calculating neighborhood proximity ('0.1 mi'), and maintaining platform trust through audit logs. We do not sell, rent, or trade member data to data brokers or advertisers.",
    },
    {
      code: "PRIV-03",
      title: "Third-Party Data Processors",
      content:
        "LendLoop uses trusted infrastructure providers to operate the service: (1) Clerk Inc. for secure passwordless and passkey authentication and identity lifecycle management; (2) Convex Inc. for reactive, type-safe database hosting; and (3) a self-hosted n8n automation engine receiving cryptographically verified HMAC-SHA256 webhooks to dispatch loan notifications and overdue reminder messages.",
    },
    {
      code: "PRIV-04",
      title: "Self-Service Erasure & Account Deletion",
      content:
        "You have the right to delete your profile at any time. Under your Member Settings, you can trigger self-service account deletion ('deleteMyAccount'). Once all active borrow and lend commitments are returned, this immediately scrubs your name, mangles and releases your email address, wipes Clerk tokens, and archives all owned tools, while preserving anonymized audit metrics to protect neighborhood record integrity.",
    },
    {
      code: "PRIV-05",
      title: "Security & Retention Protocols",
      content:
        "All data in transit is protected using TLS encryption and cryptographically signed with HMAC-SHA256 signatures for background webhook processing. Suspended accounts have their credentials immediately deactivated via live session guards to prevent unauthorized re-registration.",
    },
    {
      code: "PRIV-06",
      title: "Contact & Privacy Inquiries",
      content:
        "For privacy questions, data access inquiries, or neighborhood appeal requests, reach out directly to your designated neighborhood tool shed overseers via the platform administrator portal.",
    },
  ];

  return (
    <div className="min-h-screen bg-[#F7F5F0] text-[#1C1917] flex flex-col selection:bg-[#D95D39] selection:text-white">
      {/* Header */}
      <header className="border-b border-[#E2DDD5] bg-[#F7F5F0] sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/"
              className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-[#1C1917] hover:text-[#D95D39] transition-colors"
            >
              LendLoop
            </Link>
            <span className="hidden sm:inline-block border border-[#E2DDD5] bg-white px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest text-[#57534E]">
              Neighborhood Workshop
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="font-mono text-xs uppercase tracking-widest text-[#57534E] hover:text-[#1C1917] hidden sm:inline-block transition-colors"
            >
              [ ← Back to Catalog ]
            </Link>
            <Suspense fallback={null}>
              <Show when="signed-out">
                <SignInButton mode="modal" fallbackRedirectUrl="/dashboard" signUpFallbackRedirectUrl="/dashboard">
                  <button className="border border-[#1C1917] bg-transparent hover:bg-[#1C1917] hover:text-[#F7F5F0] text-[#1C1917] px-3 sm:px-4 py-2 text-xs font-mono uppercase tracking-widest font-semibold rounded-none transition-all active:translate-y-[1px] whitespace-nowrap shrink-0">
                    [ Sign In ]
                  </button>
                </SignInButton>
              </Show>
              <Show when="signed-in">
                <Link
                  href="/dashboard"
                  className="border border-[#1C1917] bg-white hover:bg-[#1C1917] hover:text-white text-[#1C1917] px-3 sm:px-4 py-2 text-xs font-mono uppercase tracking-widest font-semibold rounded-none transition-all active:translate-y-[1px] whitespace-nowrap shrink-0"
                >
                  [ Dashboard ]
                </Link>
              </Show>
            </Suspense>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-16 space-y-12">
        <section className="space-y-4 border-b border-[#E2DDD5] pb-8">
          <div className="inline-flex items-center gap-2 border border-[#E2DDD5] bg-white px-2.5 py-1 text-[10px] font-mono uppercase tracking-widest text-[#57534E]">
            <span className="w-1.5 h-1.5 bg-[#2D6A4F] inline-block" />
            DATA PRIVACY & PROTECTION STANDARD
          </div>

          <h1 className="font-serif text-4xl sm:text-5xl font-bold tracking-tight text-[#1C1917] leading-tight">
            Privacy Policy.
          </h1>

          <p className="text-base sm:text-lg text-[#57534E] font-sans max-w-2xl leading-relaxed pt-1">
            How LendLoop collects, uses, protects, and permanently erases neighborhood member information and tool transaction logs.
          </p>
        </section>

        {/* Privacy Sections */}
        <section className="space-y-6">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[#57534E] font-semibold">
            INFORMATION PRACTICES & MEMBER RIGHTS
          </div>

          <div className="border border-[#E2DDD5] bg-white divide-y divide-[#E2DDD5]">
            {sections.map((section) => (
              <div key={section.code} className="p-6 sm:p-8 space-y-3">
                <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-[#57534E]">
                  <span className="font-bold text-[#2D6A4F]">[{section.code}]</span>
                  <span>·</span>
                  <span className="font-semibold">{section.title}</span>
                </div>
                <p className="text-sm text-[#1C1917] font-sans leading-relaxed">
                  {section.content}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#E2DDD5] bg-[#F7F5F0] py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-xs text-[#57534E]">
          <div>LendLoop · Neighborhood Tool Shed</div>
          <nav className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link href="/" className="hover:text-[#1C1917] transition-colors">
              Public Catalog
            </Link>
            <Link href="/how-it-works" className="hover:text-[#1C1917] transition-colors">
              How It Works
            </Link>
            <Link href="/terms" className="hover:text-[#1C1917] transition-colors">
              Terms of Service
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
