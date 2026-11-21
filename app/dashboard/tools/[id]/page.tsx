"use client";

import React, { use } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { adaptTool } from "@/components/types";

interface ToolDetailProps {
  params: Promise<{ id: string }> | { id: string };
}

export default function ToolDetailPage({ params }: ToolDetailProps) {
  // Unwrap params asynchronously for Next.js 15+ compatibility
  const resolvedParams =
    typeof (params as any)?.then === "function"
      ? use(params as Promise<{ id: string }>)
      : (params as { id: string });
  const toolId = resolvedParams?.id ?? "";

  const tool = useQuery(api.tools.get, toolId ? { toolId } : "skip");

  if (tool === undefined) {
    return (
      <div className="max-w-4xl mx-auto p-6 font-mono text-xs text-[#57534E] animate-pulse">
        [ RETRIEVING TOOL RECORD #{toolId.slice(0, 8)}... ]
      </div>
    );
  }

  if (tool === null) {
    return (
      <div className="max-w-2xl mx-auto my-12 border border-[#E2DDD5] bg-white p-8 space-y-4 shadow-sm">
        <div className="text-[10px] font-mono uppercase tracking-widest text-[#D95D39] font-bold">
          [ 404 · NOT FOUND ]
        </div>
        <h1 className="font-serif text-3xl font-bold tracking-tight text-[#1C1917] uppercase">
          Tool Record Not Found
        </h1>
        <p className="text-xs font-sans text-[#57534E] leading-relaxed">
          The requested tool listing does not exist, has an invalid identifier, or was removed by its owner.
        </p>
        <div className="pt-2">
          <Link
            href="/dashboard"
            className="inline-block bg-[#1C1917] text-white hover:bg-[#D95D39] border border-[#1C1917] hover:border-[#D95D39] px-4 py-2 font-mono text-xs uppercase tracking-widest transition-colors font-semibold"
          >
            [ Back to Tool Catalog ]
          </Link>
        </div>
      </div>
    );
  }

  const adaptedTool = adaptTool(tool);

  return (
    <div className="max-w-4xl w-full mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-baseline justify-between gap-4 border-b border-[#E2DDD5] pb-4">
        <Link
          href="/dashboard"
          className="font-mono text-xs text-[#57534E] hover:text-[#1C1917] uppercase tracking-wider transition-colors"
        >
          [ ← Back to Catalog ]
        </Link>
      </div>

      <div className="border border-[#E2DDD5] bg-white p-6 sm:p-8 space-y-6">
        <div className="flex justify-between items-start gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            {adaptedTool.available ? (
              <span className="bg-[#2D6A4F] text-white font-mono text-[9px] uppercase tracking-widest px-2 py-0.5 font-semibold">
                Available Today
              </span>
            ) : (
              <span className="border border-[#E2DDD5] bg-[#F7F5F0] text-[#57534E] font-mono text-[9px] uppercase tracking-widest px-2 py-0.5">
                In Use · Back Soon
              </span>
            )}
            {adaptedTool.ownerTrusted && (
              <span className="bg-[#2D6A4F] text-white font-mono text-[9px] uppercase tracking-widest px-2 py-0.5 font-semibold">
                ID Verified
              </span>
            )}
          </div>
          <span className="font-mono text-[10px] uppercase tracking-widest text-[#57534E]">
            {adaptedTool.category.replace("_", " ")}
          </span>
        </div>

        <h1 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight text-[#1C1917] uppercase">
          {adaptedTool.name}
        </h1>

        <div className="flex flex-wrap items-center gap-3 font-mono text-xs text-[#57534E] border-y border-[#E2DDD5] py-3">
          <span>
            Owner: <strong className="text-[#1C1917]">{adaptedTool.ownerName}</strong>
          </span>
          <span>·</span>
          <span>
            Condition: <strong className="text-[#1C1917]">{adaptedTool.condition}</strong>
          </span>
          <span>·</span>
          <span>
            Location: <strong className="text-[#1C1917]">{adaptedTool.distance}</strong>
          </span>
        </div>

        <div className="font-sans text-sm text-[#57534E] leading-relaxed">
          {tool.description || "Available for neighborhood pickup."}
        </div>

        <div className="pt-4 border-t border-[#E2DDD5]">
          <Link
            href={`/dashboard?tab=browse&search=${encodeURIComponent(adaptedTool.name)}`}
            className="inline-block bg-[#D95D39] text-white hover:bg-[#1C1917] border border-[#D95D39] hover:border-[#1C1917] px-6 py-2.5 font-mono text-xs uppercase tracking-widest font-semibold transition-colors"
          >
            {adaptedTool.available ? "[ Request Tool in Dashboard ]" : "[ Check Availability ]"}
          </Link>
        </div>
      </div>
    </div>
  );
}
