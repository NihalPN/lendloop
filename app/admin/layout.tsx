import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { AccountMenuButton } from "@/components/AccountMenuButton";

export const metadata: Metadata = {
  title: "LendLoop Admin — Overseer Control Room",
  description: "Neighborhood Tool Shed administrative audit console.",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in?redirect_url=/admin");
  }

  return (
    <div className="min-h-screen bg-[#F7F5F0] text-[#1C1917] flex flex-col selection:bg-[#D95D39] selection:text-white">
      {/* Top Header & Platform Metrics Header */}
      <header className="border-b border-[#E2DDD5] bg-[#F7F5F0] sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-0 sm:h-16 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center justify-between sm:justify-start gap-3 w-full sm:w-auto">
            <Link
              href="/"
              className="font-serif text-2xl font-bold tracking-tight text-[#1C1917] hover:text-[#D95D39] transition-colors"
            >
              LendLoop
            </Link>
            <span className="border border-[#1C1917] bg-white px-2.5 py-0.5 text-xs font-mono uppercase tracking-widest text-[#1C1917] font-semibold whitespace-nowrap">
              [ Admin Control Room ]
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full sm:w-auto font-mono text-xs">
            <Link
              href="/dashboard"
              className="w-full sm:w-auto text-center border border-[#E2DDD5] bg-white hover:border-[#1C1917] text-[#1C1917] px-3.5 py-2 sm:py-1.5 uppercase tracking-widest transition-colors font-semibold whitespace-nowrap"
            >
              [ View Dashboard ]
            </Link>
            <AccountMenuButton />
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:px-6 sm:py-6">
        {children}
      </main>

      <footer className="border-t border-[#E2DDD5] bg-[#F7F5F0] py-6 px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-xs text-[#57534E]">
          <div className="text-center sm:text-left">
            LendLoop Admin · Community Tool Shed Noticeboard
          </div>
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
            <Link href="/" className="hover:text-[#1C1917] transition-colors whitespace-nowrap">
              Public Catalog
            </Link>
            <Link href="/how-it-works" className="hover:text-[#1C1917] transition-colors whitespace-nowrap">
              How It Works
            </Link>
            <Link href="/terms" className="hover:text-[#1C1917] transition-colors whitespace-nowrap">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-[#1C1917] transition-colors whitespace-nowrap">
              Privacy
            </Link>
            <Link href="/dashboard" className="hover:text-[#1C1917] transition-colors whitespace-nowrap">
              Dashboard
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
