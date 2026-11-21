"use client";

import Link from "next/link";
import { AccountMenuButton } from "@/components/AccountMenuButton";
import { useQuery, useConvexAuth } from "convex/react";
import { api } from "../convex/_generated/api";

export default function Navbar() {
  const { isAuthenticated } = useConvexAuth();
  const currentUser = useQuery(api.users.getCurrentUser, isAuthenticated ? {} : "skip");

  return (
    <header className="border-b border-[#E2DDD5] bg-[#F7F5F0] sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="font-serif text-2xl font-bold tracking-tight text-[#1C1917] hover:text-[#D95D39] transition-colors"
          >
            LendLoop
          </Link>
          <span className="hidden sm:inline-block border border-[#E2DDD5] bg-white px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest text-[#57534E]">
            Neighborhood Dashboard
          </span>
        </div>

        <div className="flex items-center gap-3 font-mono text-xs">
          <AccountMenuButton />
          {currentUser?.role === "admin" && (
            <Link
              href="/admin"
              className="border border-[#E2DDD5] bg-white hover:border-[#1C1917] text-[#1C1917] px-3 py-1.5 text-[11px] uppercase tracking-widest transition-colors"
            >
              [ Admin Room ]
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
