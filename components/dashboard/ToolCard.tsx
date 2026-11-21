"use client";

import React, { useState } from "react";
import { ToolProjection } from "@/convex/lib/projections";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

interface ToolCardProps {
  tool: ToolProjection;
  onRequestBorrow?: (tool: ToolProjection) => void;
}

export function ToolCard({ tool, onRequestBorrow }: ToolCardProps) {
  const { showToast } = useToast();
  const [isRequesting, setIsRequesting] = useState(false);
  const [hasRequested, setHasRequested] = useState(false);

  // Helper to format Date to YYYY-MM-DD local string
  const formatYMD = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const todayStr = formatYMD(new Date());
  const defaultStartStr = todayStr;
  const defaultReturnStr = formatYMD(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));

  const [startDateStr, setStartDateStr] = useState(defaultStartStr);
  const [returnDateStr, setReturnDateStr] = useState(defaultReturnStr);

  const handleStartDateChange = (newStart: string) => {
    setStartDateStr(newStart);
    if (!newStart) return;

    const [y, m, d] = newStart.split("-").map(Number);
    const startDateObj = new Date(y, m - 1, d);

    // If Return Date is on or before new Start Date, bump Return Date forward by 7 days (or at least 1 day)
    if (!returnDateStr || returnDateStr <= newStart) {
      const bumpedReturn = new Date(startDateObj.getTime() + 7 * 24 * 60 * 60 * 1000);
      setReturnDateStr(formatYMD(bumpedReturn));
    }
  };

  // Min and Max for Return Date calculated from current startDateStr
  const currentStartParts = (startDateStr || todayStr).split("-").map(Number);
  const currentStartObj = new Date(currentStartParts[0], currentStartParts[1] - 1, currentStartParts[2]);
  const minReturnStr = formatYMD(new Date(currentStartObj.getTime() + 24 * 60 * 60 * 1000));
  const maxReturnStr = formatYMD(new Date(currentStartObj.getTime() + 30 * 24 * 60 * 60 * 1000));

  const requestLoan = useMutation(api.loans.request);

  const handleRequest = async () => {
    if (!tool.available || hasRequested) return;

    setIsRequesting(true);
    try {
      const startStr = startDateStr || todayStr;
      const endStr = returnDateStr || formatYMD(new Date(currentStartObj.getTime() + 7 * 24 * 60 * 60 * 1000));

      await requestLoan({
        toolId: tool._id as any,
        startDate: startStr,
        endDate: endStr,
      });
      setHasRequested(true);
      showToast(
        "Request Dispatched",
        `Reservation sent to ${tool.ownerName} for ${tool.name}. Proposed: ${startStr} → ${endStr}.`,
        "success"
      );
      if (onRequestBorrow) onRequestBorrow(tool);
    } catch (error) {
      showToast("Error", "Failed to send request. Please try again.", "rust");
    } finally {
      setIsRequesting(false);
    }
  };

  return (
    <div className="border border-[#E2DDD5] bg-white p-5 flex flex-col justify-between hover:border-[#1C1917] transition-all duration-150 group">
      <div className="space-y-3">
        {/* Header row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            {tool.available ? (
              <StatusBadge variant="available" label="AVAILABLE TODAY" />
            ) : (
              <StatusBadge variant="in_use" label="IN USE · BACK SOON" />
            )}
            {tool.ownerTrusted && <StatusBadge variant="verified" />}
          </div>
          <span className="font-mono text-[10px] uppercase tracking-widest text-[#57534E]">
            {tool.category.replace("_", " ")}
          </span>
        </div>

        {/* Title & Metadata */}
        <div>
          <h3 className="font-serif text-xl font-bold tracking-tight text-[#1C1917] uppercase group-hover:text-[#D95D39] transition-colors">
            {tool.name}
          </h3>
          <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-[#57534E] mt-1">
            <span>
              Condition: <strong className="text-[#1C1917] capitalize">{tool.condition}</strong>
            </span>
            <span>·</span>
            <span>
              Owner: <strong className="text-[#1C1917]">{tool.ownerName || "Neighbor"}</strong>
            </span>
          </div>
        </div>

        {/* Description */}
        <p className="text-xs text-[#57534E] font-sans leading-relaxed border-t border-[#E2DDD5]/60 pt-2.5">
          {tool.description || "Fully serviced, clean, and ready for neighborhood use. No deposit required."}
        </p>
      </div>

      {/* Return Date Picker & Action Button */}
      <div className="pt-4 mt-4 border-t border-[#E2DDD5] space-y-3">
        {tool.available && !hasRequested && (
          <div className="space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1">
                <label
                  htmlFor={`start-date-${tool._id}`}
                  className="font-mono text-[10px] uppercase tracking-wider text-[#57534E] block font-semibold"
                >
                  Pickup / Start Date
                </label>
                <input
                  id={`start-date-${tool._id}`}
                  type="date"
                  value={startDateStr}
                  min={todayStr}
                  onChange={(e) => handleStartDateChange(e.target.value)}
                  className="w-full bg-[#F7F5F0] border border-[#E2DDD5] px-2.5 py-1.5 font-mono text-xs text-[#1C1917] focus:outline-none focus:border-[#1C1917] rounded-none"
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor={`return-date-${tool._id}`}
                  className="font-mono text-[10px] uppercase tracking-wider text-[#57534E] block font-semibold"
                >
                  Return Date
                </label>
                <input
                  id={`return-date-${tool._id}`}
                  type="date"
                  value={returnDateStr}
                  min={minReturnStr}
                  max={maxReturnStr}
                  onChange={(e) => setReturnDateStr(e.target.value)}
                  className="w-full bg-[#F7F5F0] border border-[#E2DDD5] px-2.5 py-1.5 font-mono text-xs text-[#1C1917] focus:outline-none focus:border-[#1C1917] rounded-none"
                />
              </div>
            </div>
            <div className="font-mono text-[10px] text-[#57534E] flex items-center justify-between border-t border-dashed border-[#E2DDD5] pt-1.5">
              <span>Proposed Loan Window:</span>
              <span className="font-bold text-[#1C1917]">
                {Math.max(
                  1,
                  Math.round(
                    (new Date(`${returnDateStr}T23:59:59`).getTime() -
                      new Date(`${startDateStr}T00:00:00`).getTime()) /
                      (24 * 60 * 60 * 1000)
                  )
                )}{" "}
                days
              </span>
            </div>
          </div>
        )}

        {tool.available ? (
          <button
            type="button"
            disabled={isRequesting || hasRequested}
            onClick={handleRequest}
            className="w-full bg-[#D95D39] text-white hover:bg-[#1C1917] border border-[#D95D39] hover:border-[#1C1917] py-2.5 font-mono text-xs uppercase tracking-widest font-semibold rounded-none transition-all active:translate-y-[1px] disabled:opacity-75 disabled:cursor-wait flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1C1917] focus-visible:ring-offset-2"
          >
            {isRequesting ? (
              <span>[ DISPATCHING... ]</span>
            ) : hasRequested ? (
              <span>[ REQUEST SENT · PENDING ]</span>
            ) : (
              <span>[ REQUEST TO BORROW ]</span>
            )}
          </button>
        ) : (
          <div className="w-full border border-[#E2DDD5] bg-[#F7F5F0] text-[#57534E] py-2.5 text-center font-mono text-xs uppercase tracking-widest cursor-not-allowed">
            [ Current Loan In Progress ]
          </div>
        )}
      </div>
    </div>
  );
}
