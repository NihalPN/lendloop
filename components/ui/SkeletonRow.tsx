import React from "react";

export function SkeletonRow() {
  return (
    <div className="border-b border-dashed border-[#E2DDD5] py-4 flex items-center justify-between animate-pulse">
      <div className="flex gap-4 w-1/2">
        <div className="h-4 bg-[#E2DDD5]/60 w-1/3" />
        <div className="h-4 bg-[#E2DDD5]/60 w-1/4" />
      </div>
      <div className="h-6 bg-[#E2DDD5]/60 w-24" />
    </div>
  );
}
