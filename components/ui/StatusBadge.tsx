import React from "react";

export type BadgeVariant =
  | "available"
  | "in_use"
  | "pending"
  | "approved"
  | "returned"
  | "late"
  | "overdue"
  | "verified"
  | "neutral";

interface StatusBadgeProps {
  variant: BadgeVariant;
  label?: string;
  size?: "sm" | "md";
}

export function StatusBadge({ variant, label, size = "md" }: StatusBadgeProps) {
  const pad = size === "sm" ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]";

  switch (variant) {
    case "available":
      return (
        <span
          className={`bg-[#2D6A4F] text-white font-mono uppercase tracking-widest font-semibold inline-flex items-center gap-1 border border-[#2D6A4F] ${pad}`}
        >
          [ {label || "AVAILABLE TODAY"} ]
        </span>
      );
    case "approved":
      return (
        <span
          className={`bg-[#2D6A4F] text-white font-mono uppercase tracking-widest font-semibold inline-flex items-center border border-[#2D6A4F] ${pad}`}
        >
          [ {label || "APPROVED"} ]
        </span>
      );
    case "late":
      return (
        <span
          className={`bg-[#FEF2F2] text-[#991B1B] border border-[#FCA5A5] font-mono uppercase tracking-widest font-bold inline-flex items-center ${pad}`}
        >
          [ {label || "LATE · OVERDUE"} ]
        </span>
      );
    case "overdue":
      return (
        <span
          className={`bg-[#FEF2F2] text-[#991B1B] border border-[#FCA5A5] font-mono uppercase tracking-widest font-bold inline-flex items-center ${pad}`}
        >
          [ {label || "OVERDUE · REMINDER SENT"} ]
        </span>
      );
    case "pending":
      return (
        <span
          className={`bg-[#FEF3C7] text-[#92400E] border border-[#D97706] font-mono uppercase tracking-widest font-semibold inline-flex items-center ${pad}`}
        >
          [ {label || "PENDING APPROVAL"} ]
        </span>
      );
    case "returned":
      return (
        <span
          className={`bg-[#F7F5F0] text-[#57534E] border border-[#E2DDD5] font-mono uppercase tracking-widest inline-flex items-center ${pad}`}
        >
          [ {label || "RETURNED"} ]
        </span>
      );
    case "in_use":
      return (
        <span
          className={`bg-[#F7F5F0] text-[#57534E] border border-[#E2DDD5] font-mono uppercase tracking-widest inline-flex items-center ${pad}`}
        >
          [ {label || "IN USE"} ]
        </span>
      );
    case "verified":
      return (
        <span
          className={`bg-white text-[#2D6A4F] border border-[#2D6A4F] font-mono uppercase tracking-widest font-semibold inline-flex items-center ${pad}`}
        >
          ID Verified
        </span>
      );
    case "neutral":
    default:
      return (
        <span
          className={`border border-[#E2DDD5] text-[#57534E] font-mono uppercase tracking-widest inline-flex items-center ${pad}`}
        >
          {label}
        </span>
      );
  }
}
