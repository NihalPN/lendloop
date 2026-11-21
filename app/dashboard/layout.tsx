import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "LendLoop Dashboard — Neighborhood Tool Shed",
  description: "Browse tools, track active loans, and share equipment.",
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/");

  return (
    <div className="min-h-screen bg-[#F7F5F0] text-[#1C1917] flex flex-col selection:bg-[#D95D39] selection:text-white">
      {/* Top Header */}
      <Navbar />

      {/* Main Content */}
      <div className="flex-1 flex flex-col w-full">{children}</div>

      {/* Footer */}
      <footer className="border-t border-[#E2DDD5] bg-[#F7F5F0] mt-auto py-6 px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-xs text-[#57534E]">
          <div className="text-center sm:text-left">
            LendLoop · Neighborhood Tool Shed Dashboard
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
            <Link href="/admin" className="hover:text-[#1C1917] transition-colors whitespace-nowrap">
              Admin Room
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
