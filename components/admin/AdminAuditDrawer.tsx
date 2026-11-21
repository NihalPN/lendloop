"use client";

import React, { useState } from "react";
import { useMutation, useQuery, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useToast } from "@/components/ui/Toast";
import { StatusBadge } from "@/components/ui/StatusBadge";

export interface AuditUserProfile {
  _id?: string;
  name: string;
  role: "user" | "admin";
  lent: number;
  borrowed: number;
  late: number;
  trusted: boolean;
  status: "active" | "suspended" | "deleted";
  associatedTool?: string;
  lastAction?: string;
}

interface AdminAuditDrawerProps {
  user: AuditUserProfile;
  onUpdateUser: (updated: AuditUserProfile) => void;
}

export function AdminAuditDrawer({ user, onUpdateUser }: AdminAuditDrawerProps) {
  const { showToast } = useToast();
  const [isTogglingRole, setIsTogglingRole] = useState(false);

  const toggleUserRole = useMutation(api.admin.toggleUserRole);
  const toggleTrustedLender = useMutation(api.admin.setTrustedLender);
  const suspendUser = useMutation(api.admin.suspendUser);
  const unsuspendUser = useMutation(api.admin.unsuspendUser);
  const { isAuthenticated } = useConvexAuth();
  const currentUser = useQuery(api.users.getCurrentUser, isAuthenticated ? {} : "skip");

  const isSelf = Boolean(user._id && currentUser?._id && user._id === currentUser._id);
  const isInactive = (user.status ?? "active") !== "active";

  const handleToggleTrusted = async () => {
    const nextTrusted = !user.trusted;
    try {
      if (user._id) {
        await toggleTrustedLender({ userId: user._id as Id<"users">, trusted: nextTrusted });
      }
      onUpdateUser({ ...user, trusted: nextTrusted });
      showToast(
        "Trusted Lender Status Changed",
        `${user.name} is ${nextTrusted ? "now designated as a Trusted Lender" : "no longer a Trusted Lender"}.`,
        nextTrusted ? "success" : "info"
      );
    } catch (err: any) {
      const errMsg = err?.data?.message || err?.message || "Failed to update trusted status.";
      showToast("Error", errMsg, "rust");
    }
  };

  const handleToggleDeactivate = async () => {
    if (isSelf) {
      showToast("Action Blocked", "Cannot suspend your own account.", "rust");
      return;
    }
    const nextStatus = user.status === "active" ? "suspended" : "active";
    try {
      if (user._id) {
        if (nextStatus === "suspended") {
          await suspendUser({ userId: user._id as Id<"users"> });
        } else {
          await unsuspendUser({ userId: user._id as Id<"users"> });
        }
      }
      onUpdateUser({ ...user, status: nextStatus });
      showToast(
        nextStatus === "suspended" ? "Account Suspended" : "Account Restored",
        `${user.name}'s borrowing and lending privileges are ${nextStatus}.`,
        nextStatus === "suspended" ? "rust" : "success"
      );
    } catch (err: any) {
      const errMsg = err?.data?.message || err?.message || "Failed to update account status.";
      showToast("Action Blocked", errMsg, "rust");
    }
  };

  const handleRoleChange = async (newRole: "user" | "admin") => {
    if (user.role === newRole) return;
    if (isSelf && newRole !== "admin") {
      showToast("Role Update Blocked", "Cannot demote your own account from admin.", "rust");
      return;
    }
    if (isInactive) {
      showToast("Role Update Blocked", "Cannot change role of a suspended or deleted user.", "rust");
      return;
    }
    setIsTogglingRole(true);
    try {
      if (user._id) {
        await toggleUserRole({ userId: user._id as Id<"users">, role: newRole });
      }
      onUpdateUser({ ...user, role: newRole });
      showToast(
        "Admin Permissions Updated",
        `${user.name} has been assigned the [${newRole.toUpperCase()}] role.`,
        "info"
      );
    } catch (err: any) {
      const errMsg = err?.data?.message || err?.message || "Failed to update user role.";
      showToast("Role Update Blocked", errMsg, "rust");
    } finally {
      setIsTogglingRole(false);
    }
  };

  return (
    <aside className="border border-[#E2DDD5] bg-white p-5 space-y-5">
      {/* Header */}
      <div className="border-b border-[#E2DDD5] pb-3">
        <div className="flex items-center justify-between gap-2">
          <span className="bg-[#1C1917] text-white font-mono text-[9px] uppercase tracking-widest px-2 py-0.5 font-semibold">
            AUDIT PROFILE
          </span>
          {user.status === "suspended" ? (
            <span className="bg-[#D95D39] text-white font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 font-bold">
              SUSPENDED
            </span>
          ) : user.status === "deleted" ? (
            <span className="bg-[#57534E] text-white font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 font-bold">
              DELETED
            </span>
          ) : (
            <span className="bg-[#2D6A4F] text-white font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 font-bold">
              ACTIVE
            </span>
          )}
        </div>
        <h3 className="font-serif text-xl font-bold tracking-tight text-[#1C1917] mt-2 uppercase">
          {user.name}
        </h3>
        <div className="flex items-center gap-2 mt-1">
          {user.trusted && <StatusBadge variant="verified" label="TRUSTED LENDER" />}
          <span className="text-[10px] font-mono text-[#57534E] uppercase">
            Role: {user.role.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Audit Stats Breakdown */}
      <div className="border border-[#E2DDD5] bg-[#F7F5F0] p-3.5 space-y-2 font-mono text-xs">
        <div className="text-[10px] text-[#57534E] uppercase tracking-widest font-semibold">
          ACTIVITY & BORROWING RECORD:
        </div>
        <div className="flex justify-between border-b border-[#E2DDD5]/60 pb-1">
          <span className="text-[#57534E]">Tools Lent to Neighbors:</span>
          <strong className="text-[#1C1917]">{user.lent}</strong>
        </div>
        <div className="flex justify-between border-b border-[#E2DDD5]/60 pb-1">
          <span className="text-[#57534E]">Tools Borrowed:</span>
          <strong className="text-[#1C1917]">{user.borrowed}</strong>
        </div>
        <div className="flex justify-between">
          <span className="text-[#57534E]">Late Return Violations:</span>
          <strong className={user.late > 0 ? "text-[#D95D39] font-bold" : "text-[#2D6A4F]"}>
            {user.late} {user.late > 0 ? "(Flagged)" : "(Clean Record)"}
          </strong>
        </div>
      </div>

      {user.associatedTool && (
        <div className="text-xs font-mono border-l-2 border-[#1C1917] pl-3 py-1 text-[#57534E]">
          Active Inquiry Tool: <strong className="text-[#1C1917]">{user.associatedTool}</strong>
        </div>
      )}

      {/* Role Switcher */}
      <div className="space-y-1.5">
        <label className="block text-[10px] font-mono uppercase tracking-widest text-[#57534E] font-semibold">
          System Role Assignment:
        </label>
        <div className="grid grid-cols-2 gap-1.5 font-mono text-xs">
          <button
            type="button"
            disabled={isTogglingRole || isInactive || (isSelf && user.role === "admin")}
            onClick={() => handleRoleChange("user")}
            className={`py-2 uppercase tracking-widest border rounded-none transition-all active:translate-y-[1px] disabled:opacity-40 disabled:cursor-not-allowed ${
              user.role === "user"
                ? "bg-[#1C1917] text-white border-[#1C1917] font-semibold"
                : "bg-white text-[#57534E] border-[#E2DDD5] hover:border-[#1C1917]"
            }`}
            title={
              isSelf && user.role === "admin"
                ? "Cannot demote your own account"
                : isInactive
                ? "Cannot change role of a suspended or deleted user"
                : undefined
            }
          >
            [ User ]
          </button>
          <button
            type="button"
            disabled={isTogglingRole || isInactive}
            onClick={() => handleRoleChange("admin")}
            className={`py-2 uppercase tracking-widest border rounded-none transition-all active:translate-y-[1px] disabled:opacity-40 disabled:cursor-not-allowed ${
              user.role === "admin"
                ? "bg-[#1C1917] text-white border-[#1C1917] font-semibold"
                : "bg-white text-[#57534E] border-[#E2DDD5] hover:border-[#1C1917]"
            }`}
            title={
              isInactive
                ? "Cannot change role of a suspended or deleted user"
                : undefined
            }
          >
            [ Admin ]
          </button>
        </div>
      </div>

      {/* Interactive Action Buttons */}
      <div className="space-y-2 pt-2 border-t border-[#E2DDD5]">
        <button
          type="button"
          onClick={handleToggleTrusted}
          className={`w-full py-2.5 font-mono text-xs uppercase tracking-widest font-semibold rounded-none border transition-all active:translate-y-[1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1C1917] focus-visible:ring-offset-2 ${
            user.trusted
              ? "bg-[#2D6A4F] text-white border-[#2D6A4F] hover:bg-[#1C1917] hover:border-[#1C1917]"
              : "bg-white text-[#1C1917] border-[#1C1917] hover:bg-[#1C1917] hover:text-white"
          }`}
        >
          [ {user.trusted ? "REVOKE TRUSTED LENDER" : "TOGGLE TRUSTED LENDER STATUS"} ]
        </button>

        {user.status !== "deleted" ? (
          <button
            type="button"
            onClick={handleToggleDeactivate}
            className={`w-full py-2.5 font-mono text-xs uppercase tracking-widest font-semibold rounded-none transition-all active:translate-y-[1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D95D39] focus-visible:ring-offset-2 ${
              user.status === "active"
                ? "bg-[#1C1917] hover:bg-[#D95D39] text-white"
                : "bg-[#2D6A4F] text-white hover:bg-[#1C1917]"
            }`}
          >
            [ {user.status === "active" ? "DEACTIVATE MEMBER" : "RESTORE MEMBER PRIVILEGES"} ]
          </button>
        ) : (
          <div className="w-full py-2 font-mono text-xs text-center border border-[#E2DDD5] bg-[#F7F5F0] text-[#57534E] uppercase">
            [ Anonymized Record ]
          </div>
        )}
      </div>

      <div className="border-t border-[#E2DDD5] pt-3 text-[10px] font-mono text-[#57534E] leading-relaxed">
        Admins can oversee loans and help resolve disputes, but cannot approve loans for their own tools as admin.
      </div>
    </aside>
  );
}
