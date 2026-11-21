import { Suspense } from "react";
import { DashboardClient } from "@/components/dashboard/DashboardClient";
import { ToolsGridSkeleton } from "@/components/ui/Skeleton";

export default function MyListingsPage() {
  return (
    <Suspense fallback={<ToolsGridSkeleton />}>
      <DashboardClient initialTab="listings" />
    </Suspense>
  );
}
