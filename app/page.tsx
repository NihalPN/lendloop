"use client";

import Link from "next/link";
import { useQuery, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { adaptPublicTool } from "@/components/types";
import { SignInButton, useAuth } from "@clerk/nextjs";
import { AccountMenuButton } from "@/components/AccountMenuButton";
import { SkeletonCard } from "@/components/ui/SkeletonCard";

export default function LandingPage() {
  const { isSignedIn, isLoaded: clerkLoaded } = useAuth();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const currentUser = useQuery(api.users.getCurrentUser, isAuthenticated ? {} : "skip");
  const publicTools = useQuery(api.tools.listPublic);
  const authTools = useQuery(api.tools.listAll, isAuthenticated ? {} : "skip");

  const rawTools = isAuthenticated && authTools ? authTools : publicTools;
  const userLoggedIn = Boolean(isSignedIn || isAuthenticated);
  const isAuthChecking = !clerkLoaded || (userLoggedIn ? authLoading : false);

  return (
    <div className="min-h-screen bg-[#F7F5F0] text-[#1C1917] flex flex-col selection:bg-[#D95D39] selection:text-white">
      {/* 1. Header (Minimal Structural Bar) */}
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

          <div className="flex items-center">
            {isAuthChecking ? (
              <div className="w-24 h-8" />
            ) : userLoggedIn ? (
              <div className="flex items-center gap-2 sm:gap-3 font-mono text-xs">
                <Link
                  href="/dashboard"
                  className="border border-[#E2DDD5] bg-white hover:border-[#1C1917] text-[#1C1917] px-3 sm:px-3.5 py-1.5 text-xs uppercase tracking-widest transition-colors font-semibold whitespace-nowrap"
                >
                  [ Dashboard ]
                </Link>
                {currentUser?.role === "admin" && (
                  <Link
                    href="/admin"
                    className="border border-[#1C1917] bg-white hover:bg-[#1C1917] hover:text-white text-[#1C1917] px-3 sm:px-3.5 py-1.5 text-xs uppercase tracking-widest transition-colors font-semibold whitespace-nowrap"
                  >
                    [ Admin ]
                  </Link>
                )}
                <AccountMenuButton />
              </div>
            ) : (
              <SignInButton mode="modal" fallbackRedirectUrl="/dashboard" signUpFallbackRedirectUrl="/dashboard">
                <button className="border border-[#1C1917] bg-transparent hover:bg-[#1C1917] hover:text-[#F7F5F0] text-[#1C1917] px-3 sm:px-4 py-2 text-xs font-mono uppercase tracking-widest font-semibold rounded-none transition-all active:translate-y-[1px] whitespace-nowrap shrink-0">
                  <span className="sm:hidden">[ Sign In ]</span>
                  <span className="hidden sm:inline">[ Sign In to Lend or Borrow ]</span>
                </button>
              </SignInButton>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 flex flex-col justify-between">
        {/* 2. Hero Section */}
        <section className="mb-12 sm:mb-16 border-b border-[#E2DDD5] pb-12 sm:pb-16">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-[#1C1917] leading-none mb-4">
              Borrow what you need.<br />
              Lend what you don't.
            </h1>
            <p className="text-lg sm:text-xl text-[#57534E] font-sans max-w-2xl mx-auto">
              Your neighborhood tool shed.
            </p>

            <div className="flex justify-center mt-6 gap-4">
              {userLoggedIn ? (
                <Link
                  className="bg-[#D95D39] text-white px-6 py-2.5 font-mono text-xs uppercase tracking-widest hover:bg-[#1C1917] transition-colors border border-[#D95D39] hover:border-[#1C1917] inline-block font-semibold active:translate-y-[1px] whitespace-nowrap"
                  href="/dashboard"
                >
                  [ Browse the Catalogue ]
                </Link>
              ) : (
                <SignInButton fallbackRedirectUrl="/dashboard" mode="modal" signUpFallbackRedirectUrl="/dashboard">
                  <button className="bg-[#D95D39] text-white px-6 py-2.5 font-mono text-xs uppercase tracking-widest hover:bg-[#1C1917] transition-colors border border-[#D95D39] hover:border-[#1C1917] font-semibold active:translate-y-[1px] whitespace-nowrap">
                    [ Sign In ]
                  </button>
                </SignInButton>
              )}
            </div>
          </div>
        </section>

        {/* 3. Available Tools Grid */}
        <section className="mb-12 sm:mb-16">
          <div className="flex items-center justify-between mb-8">
            <h2 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-[#1C1917] uppercase">
              Available in the Shed
            </h2>
            <div className="flex items-center gap-3">
              <span className="hidden sm:inline font-mono text-xs text-[#57534E] uppercase tracking-wider">
                [ {rawTools ? rawTools.length : 0} tools available ]
              </span>
            </div>
          </div>

          {rawTools === undefined ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : rawTools.length === 0 ? (
            <div className="col-span-full py-12 text-center text-[#57534E] font-mono text-sm border border-dashed border-[#E2DDD5]">
              No tools currently available.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
              {rawTools.map((tool: any, index: number) => {
                const categoryLabel = (tool.category || "General").replace("_", " ");
                const condition = (tool.condition || "good").toLowerCase();
                const conditionLabel = condition.charAt(0).toUpperCase() + condition.slice(1);
                const owner = userLoggedIn ? (tool.ownerName || "Neighbor") : "Neighbor";
                const description =
                  tool.description && tool.description.trim() !== ""
                    ? tool.description
                    : "Available for neighborhood pickup.";

                return (
                  <div
                    key={(tool._id || tool.id || index) + "-" + index}
                    className="bg-white border border-[#E2DDD5] p-6 flex flex-col h-full hover:border-[#1C1917] transition-colors"
                  >
                    {/* 1. Top row */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {tool.available ? (
                          <span className="bg-[#2D6A4F] text-white font-mono text-[9px] uppercase tracking-widest px-2 py-0.5 font-semibold whitespace-nowrap">
                            Available Today
                          </span>
                        ) : (
                          <span className="border border-[#E2DDD5] bg-[#F7F5F0] text-[#57534E] font-mono text-[9px] uppercase tracking-widest px-2 py-0.5 whitespace-nowrap">
                            In Use · Back Soon
                          </span>
                        )}
                        {tool.ownerTrusted && (
                          <span className="bg-[#2D6A4F] text-white font-mono text-[9px] uppercase tracking-widest px-2 py-0.5 font-semibold whitespace-nowrap">
                            ID Verified
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-[9px] uppercase tracking-widest text-[#57534E] whitespace-nowrap">
                        {categoryLabel}
                      </span>
                    </div>

                    {/* 2. Title */}
                    <h3 className="font-serif text-xl font-bold tracking-tight text-[#1C1917] uppercase mb-1">
                      {tool.name}
                    </h3>

                    {/* 3. Metadata line */}
                    <div className="flex items-center gap-2 font-mono text-xs text-[#57534E] mb-3">
                      <span>
                        Condition: <strong className="text-[#1C1917]">{conditionLabel}</strong>
                      </span>
                      <span>·</span>
                      <span>
                        Owner: <strong className="text-[#1C1917]">{owner}</strong>
                      </span>
                    </div>

                    {/* 4. Description clamped in flex-1 body */}
                    <div className="flex-1 mb-4">
                      <p className="text-xs text-[#57534E] font-sans leading-relaxed line-clamp-2">
                        {description}
                      </p>
                    </div>

                    {/* 5. Footer row */}
                    <div className="mt-auto pt-4 border-t border-[#E2DDD5] flex justify-end items-center">
                      {!userLoggedIn ? (
                        <SignInButton mode="modal" fallbackRedirectUrl="/dashboard" signUpFallbackRedirectUrl="/dashboard">
                          <button className="font-mono text-xs uppercase tracking-widest text-[#D95D39] hover:text-[#1C1917] font-semibold active:translate-y-[1px] whitespace-nowrap">
                            [ Sign In to Request ]
                          </button>
                        </SignInButton>
                      ) : (
                        <Link
                          href={`/dashboard?tab=browse&search=${encodeURIComponent(tool.name)}`}
                          className="font-mono text-xs uppercase tracking-widest text-[#D95D39] hover:text-[#1C1917] font-semibold active:translate-y-[1px] whitespace-nowrap"
                        >
                          [ View & Request ]
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 4. Bottom Informational Banner / Strip (Only rendered when logged out) */}
        {!userLoggedIn && (
          <aside className="mt-8 border border-[#D95D39] bg-[#D95D39] text-white p-5 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="font-sans text-sm sm:text-base font-medium leading-snug text-center sm:text-left max-w-xl">
              Create a free account to view owner details and request tools.
            </div>
            <SignInButton mode="modal" fallbackRedirectUrl="/dashboard" signUpFallbackRedirectUrl="/dashboard">
              <button className="w-full sm:w-auto text-center border border-white bg-white text-[#1C1917] hover:bg-[#1C1917] hover:text-white hover:border-[#1C1917] px-6 py-2.5 font-mono text-xs uppercase tracking-widest font-semibold whitespace-nowrap transition-all active:translate-y-[1px] shrink-0">
                [ Join The Shed ]
              </button>
            </SignInButton>
          </aside>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#E2DDD5] bg-[#F7F5F0] mt-12 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-xs text-[#57534E]">
          <div className="text-center sm:text-left">
            LendLoop · Neighborhood Tool-Lending Board
          </div>
          <nav className="flex flex-wrap items-center justify-center gap-6">
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
            <Link href="/admin" className="hover:text-[#1C1917] transition-colors whitespace-nowrap">
              Admin Room
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
