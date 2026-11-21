"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useConvexAuth, useQuery } from "convex/react";
import { useClerk } from "@clerk/nextjs";
import { api } from "@/convex/_generated/api";

/**
 * SessionGuard: Watches the live viewer state in Convex.
 * If an active session is suspended or deleted by an administrator,
 * it immediately triggers sign-out and redirects to /login with the dismissal reason.
 */
export function SessionGuard() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signOut } = useClerk();
  const viewer = useQuery(api.users.viewer, isAuthenticated ? {} : "skip");
  const signingOutRef = useRef(false);

  useEffect(() => {
    // Only verify once Convex auth is resolved and caller is authenticated
    if (isLoading || !isAuthenticated) return;
    if (viewer === undefined) return; // Viewer query is still resolving

    const status = viewer?.status ?? (viewer === null ? "removed" : "active");

    if (status !== "active" && !signingOutRef.current) {
      signingOutRef.current = true;
      const reason = status === "suspended" ? "suspended" : status === "deleted" ? "deleted" : "removed";
      const targetUrl = `/login?reason=${reason}`;

      signOut({ redirectUrl: targetUrl }).catch(() => {
        router.replace(targetUrl);
      });
    }
  }, [isAuthenticated, isLoading, viewer, signOut, router]);

  return null;
}
