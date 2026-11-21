"use client";
import { useConvexAuth } from "convex/react";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { useEffect } from "react";

export default function AuthSync() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const storeUser = useMutation(api.users.storeUser);

  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      storeUser().catch(console.error);
    }
  }, [isAuthenticated, isLoading, storeUser]);

  return null;
}
