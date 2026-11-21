import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { SignInButton, Show } from "@clerk/nextjs";

export const metadata: Metadata = {
  title: "Terms of Service — LendLoop Neighborhood Tool Shed",
  description: "Neighborhood tool sharing operating agreement, equipment disclaimers, and community liability waivers.",
};

export default function TermsPage() {
  const sections = [
    {
      code: "TERM-01",
      title: "Community Tool Sharing Protocol",
      content:
        "LendLoop is an open, non-commercial neighborhood noticeboard that enables verified neighbors to lend and borrow tools, equipment, and home workshop machinery on a voluntary, zero-fee basis. LendLoop operates purely as a coordination board and is not a rental agency, tool manufacturer, or equipment insurer.",
    },
    {
      code: "TERM-02",
      title: "As-Is Condition & No Warranties",
      content:
        "All shared equipment is provided strictly 'as-is' and 'where-is', without any warranties of any kind—whether express, implied, or statutory—including but not limited to warranties of merchantability, fitness for a particular project, or mechanical reliability. Tool owners provide subjective condition assessments ('New', 'Good', 'Fair', 'Worn') in good faith, but borrowers are solely responsible for inspecting equipment before use.",
    },
    {
      code: "TERM-03",
      title: "Assumption of Risk & Safety Precautions",
      content:
        "Operating workshop machinery, power tools, lawn care equipment, and ladders involves inherent dangers, including property damage, electrical hazards, and severe bodily injury. By requesting and accepting a tool, borrowers explicitly assume all associated risks and agree to wear appropriate personal protective equipment (PPE), follow manufacturer operating manuals, and never disable safety guards or interlocks.",
    },
    {
      code: "TERM-04",
      title: "Mutual Hold-Harmless & Release of Liability",
      content:
        "To the fullest extent permitted by applicable law, borrowers agree to hold harmless and release tool owners and the LendLoop platform administrators from any and all claims, liabilities, damages, or injuries arising directly or indirectly from tool possession, transportation, operation, or delayed return.",
    },
    {
      code: "TERM-05",
      title: "Timely Returns & Equipment Care",
      content:
        "Borrowers agree to return tools on or before the agreed return date in the same or cleaner condition than received, with batteries recharged and accessories intact. Overdue loans trigger automated reminders and may result in neighborhood trusted-lender badge revocation or account suspension.",
    },
    {
      code: "TERM-06",
      title: "Account Termination & Administration",
      content:
        "Community administrators reserve the right to suspend or soft-delete accounts that violate trust, fail to return borrowed equipment, or engage in harassing behavior. Users may independently delete their own profiles at any time via self-service account deletion, provided all active borrow and lend obligations are closed.",
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
            <span className="w-1.5 h-1.5 bg-[#1C1917] inline-block" />
            LEGAL NOTICE & USER AGREEMENT
          </div>

          <h1 className="font-serif text-4xl sm:text-5xl font-bold tracking-tight text-[#1C1917] leading-tight">
            Terms of Service.
          </h1>

          <p className="text-base sm:text-lg text-[#57534E] font-sans max-w-2xl leading-relaxed pt-1">
            Rules, equipment disclaimers, and community liability terms for borrowing and lending tools in the neighborhood shed.
          </p>
        </section>

        {/* Terms Sections */}
        <section className="space-y-6">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[#57534E] font-semibold">
            COMMUNITY BORROWING PROTOCOLS
          </div>

          <div className="border border-[#E2DDD5] bg-white divide-y divide-[#E2DDD5]">
            {sections.map((section) => (
              <div key={section.code} className="p-6 sm:p-8 space-y-3">
                <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-[#57534E]">
                  <span className="font-bold text-[#D95D39]">[{section.code}]</span>
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
            <Link href="/privacy" className="hover:text-[#1C1917] transition-colors">
              Privacy Policy
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
