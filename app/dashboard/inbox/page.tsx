import { Suspense } from "react";
import { DashboardClient } from "@/components/dashboard/DashboardClient";
import { ToolsGridSkeleton } from "@/components/ui/Skeleton";

export default function InboxPage() {
  return (
    <Suspense fallback={<ToolsGridSkeleton />}>
      <DashboardClient initialTab="inbox" />
    </Suspense>
  );
}
