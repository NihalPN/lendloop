"use client";

import { useEffect } from "react";
import Link from "next/link";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AdminError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("[LendLoop Admin Error]", error.message);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#F7F5F0] text-[#1C1917] flex items-center justify-center p-4">
      <div className="w-full max-w-md border border-[#E2DDD5] bg-white p-6">
        <div className="border-b border-[#E2DDD5] pb-4 mb-4">
          <h1 className="font-serif text-2xl font-bold tracking-tight text-[#1C1917]">
            Something went wrong in the control room.
          </h1>
        </div>
        <div className="mb-6">
          <p className="font-mono text-xs text-[#57534E] mb-2">Error Details:</p>
          <pre className="font-mono text-xs text-[#1C1917] bg-[#F7F5F0] border border-[#E2DDD5] p-3 overflow-auto max-h-40 whitespace-pre-wrap">
            {error.message || "Unknown error occurred"}
          </pre>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={reset}
            className="flex-1 bg-[#D95D39] text-white py-2.5 font-mono text-xs uppercase tracking-widest font-semibold border border-[#D95D39] hover:bg-[#1C1917] hover:border-[#1C1917] transition-colors active:translate-y-[1px]"
          >
            [ Try Again ]
          </button>
          <Link
            href="/dashboard"
            className="flex-1 text-center border border-[#E2DDD5] bg-white text-[#1C1917] py-2.5 font-mono text-xs uppercase tracking-widest font-semibold hover:border-[#1C1917] hover:bg-[#F7F5F0] transition-colors active:translate-y-[1px]"
          >
            [ Return to Dashboard ]
          </Link>
        </div>
      </div>
    </div>
  );
}
