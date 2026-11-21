import { Suspense } from "react";
import { DashboardClient } from "@/components/dashboard/DashboardClient";
import { ToolsGridSkeleton } from "@/components/ui/Skeleton";

export default function MyRequestsPage() {
  return (
    <Suspense fallback={<ToolsGridSkeleton />}>
      <DashboardClient initialTab="requests" />
    </Suspense>
  );
}
