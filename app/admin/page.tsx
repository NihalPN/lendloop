"use client";

import { useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AdminClient } from "@/components/admin/AdminClient";
import { TableSkeleton } from "@/components/ui/Skeleton";

export default function AdminPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const currentUser = useQuery(api.users.getCurrentUser, isAuthenticated ? {} : "skip");

  useEffect(() => {
    if (!isLoading && (currentUser === null || (!isAuthenticated && !isLoading) || (currentUser && currentUser.role !== "admin"))) {
      router.push("/dashboard");
    }
  }, [currentUser, isAuthenticated, isLoading, router]);

  if (isLoading || currentUser === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center font-mono text-sm text-[#57534E] animate-pulse">
        [ VERIFYING ADMIN CLEARANCE... ]
      </div>
    );
  }

  if (currentUser === null || currentUser.role !== "admin") {
    return null;
  }

  return (
    <Suspense fallback={<TableSkeleton />}>
      <AdminClient />
    </Suspense>
  );
}
