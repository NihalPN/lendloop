import React from "react";

export function SkeletonCard() {
  return (
    <div className="border border-dashed border-[#E2DDD5] p-4 flex flex-col gap-4 animate-pulse bg-[#F7F5F0] min-h-[250px]">
      <div className="h-40 bg-[#E2DDD5]/60 w-full" />
      <div className="h-4 bg-[#E2DDD5]/60 w-3/4" />
      <div className="h-4 bg-[#E2DDD5]/60 w-1/2" />
      <div className="mt-auto h-8 bg-[#E2DDD5]/60 w-full" />
    </div>
  );
}
