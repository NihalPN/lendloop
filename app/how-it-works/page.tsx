import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { SignInButton, Show } from "@clerk/nextjs";

export const metadata: Metadata = {
  title: "How It Works — LendLoop Neighborhood Tool Shed",
  description: "Learn how neighborhood tool lending works: browse, pickup, return, and build community trust.",
};

export default function HowItWorksPage() {
  const steps = [
    {
      number: "01",
      title: "Browse & Request",
      summary:
        "Find what you need in the neighborhood shed and request a date. No deposits, no rental fees.",
      details:
        "Search nearby listings by category, check tool condition ratings, and select your target reservation dates (up to a 30-day maximum). The tool owner is immediately notified to review and approve your request.",
    },
    {
      number: "02",
      title: "Pick Up",
      summary:
        "Once approved, coordinate a quick porch pickup with your neighbor via our secure chat.",
      details:
        "Arrange a convenient pickup time directly with your neighbor. Inspect the tool, verify included accessories or blade guards, and get any helpful operator guidance.",
    },
    {
      number: "03",
      title: "Return & Review",
      summary:
        "Bring it back clean and on time. Build your reputation as a trusted neighbor.",
      details:
        "Return the equipment clean, fully charged, and ready for the next neighbor. Mark the loan as returned in the dashboard to maintain a 100% on-time record and earn verified community badges.",
    },
  ];

  return (
    <div className="min-h-screen bg-[#F7F5F0] text-[#1C1917] flex flex-col selection:bg-[#D95D39] selection:text-white">
      {/* 1. Header */}
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
                    <span className="sm:hidden">[ Sign In ]</span>
                    <span className="hidden sm:inline">[ Sign In ]</span>
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

      {/* Main Content Area */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-16 space-y-12">
        {/* Title Section */}
        <section className="space-y-4 border-b border-[#E2DDD5] pb-8">
          <div className="inline-flex items-center gap-2 border border-[#E2DDD5] bg-white px-2.5 py-1 text-[10px] font-mono uppercase tracking-widest text-[#57534E]">
            <span className="w-1.5 h-1.5 bg-[#2D6A4F] inline-block" />
            COMMUNITY OPERATING GUIDELINES
          </div>

          <h1 className="font-serif text-4xl sm:text-6xl font-bold tracking-tight text-[#1C1917] leading-[1.05]">
            How LendLoop Works.
          </h1>

          <p className="text-base sm:text-lg text-[#57534E] font-sans max-w-2xl leading-relaxed pt-1">
            Borrow tools for your weekend projects, and lend out the ones gathering dust.
            A free, direct neighborhood tool shed built on mutual trust, care for equipment, and local accountability.
          </p>
        </section>

        {/* 3-Step Process (Clean document layout) */}
        <section className="space-y-6">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[#57534E] font-semibold">
            THREE STEPS TO SHARING TOOLS
          </div>

          <div className="border border-[#E2DDD5] bg-white divide-y divide-[#E2DDD5]">
            {steps.map((step) => (
              <div
                key={step.number}
                className="p-6 sm:p-8 flex flex-col md:flex-row items-start gap-6 hover:bg-[#F7F5F0]/40 transition-colors"
              >
                {/* Step Number Badge */}
                <div className="flex md:flex-col items-center gap-3 shrink-0">
                  <span className="border border-[#1C1917] bg-[#1C1917] text-white font-mono text-xs font-bold px-2.5 py-1 tracking-widest uppercase">
                    STEP {step.number}
                  </span>
                </div>

                {/* Step Content */}
                <div className="space-y-2 flex-1 min-w-0">
                  <h2 className="font-serif text-2xl font-bold tracking-tight text-[#1C1917] uppercase">
                    {step.title}
                  </h2>
                  <p className="font-sans text-base font-semibold text-[#1C1917] leading-snug">
                    &ldquo;{step.summary}&rdquo;
                  </p>
                  <p className="font-sans text-xs text-[#57534E] leading-relaxed pt-1">
                    {step.details}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Community Principles Card */}
        <section className="border border-[#E2DDD5] bg-[#F7F5F0] p-6 sm:p-8 space-y-4">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[#57534E] font-semibold">
            THE NEIGHBORHOOD PLEDGE
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono text-xs">
            <div className="border border-[#E2DDD5] bg-white p-4 space-y-1">
              <strong className="text-[#1C1917] block uppercase">01 / Free of Charge</strong>
              <p className="text-[#57534E] text-[11px] font-sans">
                Never pay rental rates or security deposits. Tools are shared neighbor-to-neighbor.
              </p>
            </div>
            <div className="border border-[#E2DDD5] bg-white p-4 space-y-1">
              <strong className="text-[#1C1917] block uppercase">02 / 30-Day Limits</strong>
              <p className="text-[#57534E] text-[11px] font-sans">
                Maximum loan periods keep tools circulating back to owners and other neighbors.
              </p>
            </div>
            <div className="border border-[#E2DDD5] bg-white p-4 space-y-1">
              <strong className="text-[#1C1917] block uppercase">03 / Care & Respect</strong>
              <p className="text-[#57534E] text-[11px] font-sans">
                Return tools wiped down, fully functioning, and on time to protect your neighbor rating.
              </p>
            </div>
          </div>
        </section>

        {/* Action Button Strip */}
        <section className="pt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
          <Link
            href="/"
            className="w-full sm:w-auto text-center justify-center bg-[#D95D39] text-white hover:bg-[#1C1917] border border-[#D95D39] hover:border-[#1C1917] px-8 py-3.5 font-mono text-xs uppercase tracking-widest font-semibold rounded-none transition-all active:translate-y-[1px] inline-flex items-center gap-2"
          >
            [ Browse Tools → ]
          </Link>
          <Suspense fallback={null}>
            <Show when="signed-out">
              <SignInButton mode="modal" fallbackRedirectUrl="/dashboard" signUpFallbackRedirectUrl="/dashboard">
                <button className="w-full sm:w-auto text-center justify-center border border-[#1C1917] bg-white hover:bg-[#1C1917] hover:text-white text-[#1C1917] px-6 py-3.5 font-mono text-xs uppercase tracking-widest font-semibold rounded-none transition-all active:translate-y-[1px] inline-flex items-center">
                  [ Join The Shed ]
                </button>
              </SignInButton>
            </Show>
            <Show when="signed-in">
              <Link
                href="/dashboard"
                className="w-full sm:w-auto text-center justify-center border border-[#1C1917] bg-white hover:bg-[#1C1917] hover:text-white text-[#1C1917] px-6 py-3.5 font-mono text-xs uppercase tracking-widest font-semibold rounded-none transition-all active:translate-y-[1px] inline-flex items-center"
              >
                [ Open Dashboard ]
              </Link>
            </Show>
          </Suspense>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#E2DDD5] bg-[#F7F5F0] mt-16 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-xs text-[#57534E]">
          <div className="text-center sm:text-left">
            LendLoop · Neighborhood Tool-Lending Board
          </div>
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
            <Link href="/" className="hover:text-[#1C1917] transition-colors whitespace-nowrap">
              Public Catalog
            </Link>
            <Link href="/dashboard" className="hover:text-[#1C1917] transition-colors whitespace-nowrap">
              Dashboard
            </Link>
            <Link href="/admin" className="hover:text-[#1C1917] transition-colors whitespace-nowrap">
              Admin Room
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
