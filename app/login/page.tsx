"use client";

import React, { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SignInButton, useAuth } from "@clerk/nextjs";

function LoginContent() {
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");
  const { isSignedIn } = useAuth();

  return (
    <div className="w-full max-w-md mx-auto space-y-6">
      {/* Alert banner if redirected due to suspension or removal */}
      {reason === "suspended" && (
        <div className="border-2 border-[#D95D39] bg-white p-5 font-mono shadow-sm">
          <div className="flex items-center gap-2 text-[#D95D39] text-xs font-bold uppercase tracking-widest mb-2">
            <span className="inline-block w-2.5 h-2.5 bg-[#D95D39]" />
            [ ACCESS RESTRICTED: ACCOUNT SUSPENDED ]
          </div>
          <p className="text-xs text-[#1C1917] leading-relaxed">
            Your neighborhood clearance has been temporarily suspended by an administrator.
            All active tool listings have been archived and pending loan requests cancelled.
          </p>
          <div className="mt-3 pt-3 border-t border-[#E2DDD5] text-[10px] text-[#57534E] uppercase tracking-wider">
            Login & re-registration blocked · Contact your neighborhood tool board to appeal.
          </div>
        </div>
      )}

      {(reason === "removed" || reason === "deleted") && (
        <div className="border-2 border-[#1C1917] bg-white p-5 font-mono shadow-sm">
          <div className="flex items-center gap-2 text-[#1C1917] text-xs font-bold uppercase tracking-widest mb-2">
            <span className="inline-block w-2.5 h-2.5 bg-[#1C1917]" />
            [ ACCOUNT RELEASED: SOFT-DELETED ]
          </div>
          <p className="text-xs text-[#1C1917] leading-relaxed">
            This account has been anonymized and credentials unlinked. Prior lending
            history has been preserved for neighborhood audit integrity, while your email address
            has been released.
          </p>
          <div className="mt-3 pt-3 border-t border-[#E2DDD5] text-[10px] text-[#57534E] uppercase tracking-wider">
            You may register a clean profile with your original email if permitted.
          </div>
        </div>
      )}

      {/* Main Login / Authentication Card */}
      <div className="border border-[#E2DDD5] bg-white p-6 sm:p-8 space-y-6">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-[#57534E] mb-1">
            MEMBER AUTHENTICATION
          </div>
          <h1 className="font-serif text-2xl font-bold tracking-tight text-[#1C1917] uppercase">
            Neighborhood Sign In
          </h1>
          <p className="text-xs font-sans text-[#57534E] mt-1">
            Access tool reservations, catalog management, and neighborhood lending records.
          </p>
        </div>

        <div className="pt-2">
          {!isSignedIn ? (
            <SignInButton mode="modal" fallbackRedirectUrl="/dashboard" signUpFallbackRedirectUrl="/dashboard">
              <button
                type="button"
                className="w-full bg-[#1C1917] text-white hover:bg-[#D95D39] border border-[#1C1917] hover:border-[#D95D39] py-3 px-4 font-mono text-xs uppercase tracking-widest font-semibold rounded-none transition-all active:translate-y-[1px]"
              >
                [ Proceed to Secure Sign In ]
              </button>
            </SignInButton>
          ) : (
            <Link
              href="/dashboard"
              className="block w-full text-center bg-[#2D6A4F] text-white hover:bg-[#1C1917] border border-[#2D6A4F] hover:border-[#1C1917] py-3 px-4 font-mono text-xs uppercase tracking-widest font-semibold rounded-none transition-all active:translate-y-[1px]"
            >
              [ Open Member Dashboard ]
            </Link>
          )}
        </div>

        <div className="border-t border-[#E2DDD5] pt-4 flex items-center justify-between font-mono text-[10px] uppercase text-[#57534E]">
          <Link href="/" className="hover:text-[#1C1917] transition-colors">
            ← Back to Tool Catalog
          </Link>
          <span>LendLoop v1.0</span>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[#F7F5F0] text-[#1C1917] flex flex-col justify-between selection:bg-[#D95D39] selection:text-white px-4 py-8">
      <header className="max-w-7xl w-full mx-auto flex items-center justify-between pb-6 border-b border-[#E2DDD5]">
        <Link
          href="/"
          className="font-serif text-2xl font-bold tracking-tight text-[#1C1917] hover:text-[#D95D39] transition-colors"
        >
          LendLoop
        </Link>
        <span className="border border-[#E2DDD5] bg-white px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest text-[#57534E]">
          Neighborhood Workshop
        </span>
      </header>

      <main className="my-auto py-8">
        <Suspense
          fallback={
            <div className="text-center font-mono text-xs text-[#57534E] animate-pulse">
              [ LOADING AUTHENTICATION PORTAL... ]
            </div>
          }
        >
          <LoginContent />
        </Suspense>
      </main>

      <footer className="max-w-7xl w-full mx-auto pt-6 border-t border-[#E2DDD5] text-center font-mono text-[10px] text-[#57534E] uppercase tracking-wider">
        Neighborhood Tool Shed · Community Resource Protocol
      </footer>
    </div>
  );
}
