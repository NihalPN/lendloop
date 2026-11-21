"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import { AuditUserProfile } from "@/components/admin/AdminAuditDrawer";
import { SkeletonRow } from "@/components/ui/SkeletonRow";
import { Id } from "@/convex/_generated/dataModel";

interface AdminUsersTableProps {
  onSelectUser?: (user: AuditUserProfile) => void;
}

interface PendingActionState {
  type: "suspend" | "restore" | "delete";
  userId: Id<"users">;
  userName: string;
  email: string;
}

export function AdminUsersTable({ onSelectUser }: AdminUsersTableProps) {
  const { showToast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingActionState | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittingRoleId, setSubmittingRoleId] = useState<Id<"users"> | null>(null);

  const { isAuthenticated } = useConvexAuth();
  const users = useQuery(api.admin.listUsers, isAuthenticated ? {} : "skip");
  const currentUser = useQuery(api.users.getCurrentUser, isAuthenticated ? {} : "skip");

  const setTrustedLender = useMutation(api.admin.setTrustedLender);
  const toggleUserRole = useMutation(api.admin.toggleUserRole);
  const suspendUser = useMutation(api.admin.suspendUser);
  const unsuspendUser = useMutation(api.admin.unsuspendUser);
  const deleteUser = useMutation(api.admin.deleteUser);

  if (!users) {
    return (
      <div className="border border-[#E2DDD5] bg-white p-4 space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="border border-[#E2DDD5] bg-white p-8 font-mono text-sm text-[#57534E] text-center">
        No users found.
      </div>
    );
  }

  const filteredUsers = users.filter((u) => {
    const q = searchQuery.toLowerCase();
    return (
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u._id.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q) ||
      (u.status ?? "active").toLowerCase().includes(q)
    );
  });

  const handleToggleTrusted = async (userId: Id<"users">, currentTrusted: boolean, userName: string) => {
    try {
      await setTrustedLender({ userId, trusted: !currentTrusted });
      showToast(
        "Trusted Lender Status Changed",
        `${userName} is ${!currentTrusted ? "now designated as a Trusted Lender" : "no longer a Trusted Lender"}.`,
        !currentTrusted ? "success" : "info"
      );
    } catch (err: any) {
      showToast("Error", err?.data?.message || err?.message || "Failed to update trusted status.", "rust");
    }
  };

  const handleToggleRole = async (userId: Id<"users">, currentRole: "user" | "admin", userName: string) => {
    const nextRole = currentRole === "admin" ? "user" : "admin";
    setSubmittingRoleId(userId);
    try {
      await toggleUserRole({ userId, role: nextRole });
      showToast(
        "Role Updated",
        `${userName} has been reassigned to [${nextRole.toUpperCase()}].`,
        "info"
      );
    } catch (err: any) {
      const errMsg = err?.data?.message || err?.message || "Failed to update user role.";
      showToast("Role Update Blocked", errMsg, "rust");
    } finally {
      setSubmittingRoleId(null);
    }
  };

  const handleExecutePendingAction = async () => {
    if (!pendingAction) return;
    setIsSubmitting(true);
    try {
      if (pendingAction.type === "suspend") {
        await suspendUser({ userId: pendingAction.userId });
        showToast(
          "Account Suspended",
          `${pendingAction.userName} has been suspended. Listings archived and pending loans cancelled.`,
          "rust"
        );
      } else if (pendingAction.type === "restore") {
        await unsuspendUser({ userId: pendingAction.userId });
        showToast(
          "Account Restored",
          `${pendingAction.userName}'s privileges and login access have been restored.`,
          "success"
        );
      } else if (pendingAction.type === "delete") {
        await deleteUser({ userId: pendingAction.userId });
        showToast(
          "Account Soft-Deleted",
          `${pendingAction.userName} has been anonymized. Email address released for clean re-registration.`,
          "info"
        );
      }
      setPendingAction(null);
    } catch (err: any) {
      const errMsg = err?.data?.message || err?.message || "Action failed to execute";
      showToast("Action Blocked", errMsg, "rust");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="border border-[#E2DDD5] bg-white p-4 sm:p-5 space-y-4">
      {/* Title */}
      <div>
        <h2 className="font-serif text-xl sm:text-2xl font-bold tracking-tight text-[#1C1917] uppercase">
          Admin: Manage Users
        </h2>
        <p className="text-xs text-[#57534E] font-sans mt-0.5">
          Audit neighborhood credentials, update clearance roles, and oversee account suspension or deletion.
        </p>
      </div>

      {/* Search Toolbar */}
      <div className="border-t border-b border-[#E2DDD5] py-3.5">
        <input
          type="text"
          placeholder="Search users by name, email, role, status, or ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-[#F7F5F0] border border-[#E2DDD5] px-3.5 py-2 text-xs font-mono text-[#1C1917] focus:outline-none focus:border-[#1C1917] focus-visible:ring-2 focus-visible:ring-[#1C1917] focus-visible:ring-offset-1 rounded-none transition-colors"
        />
      </div>

      {/* Confirmation Modal */}
      {pendingAction && (
        <div className="border-2 border-[#1C1917] bg-[#F7F5F0] p-4 sm:p-5 font-mono space-y-3">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 inline-block ${
                pendingAction.type === "restore" ? "bg-[#2D6A4F]" : "bg-[#D95D39]"
              }`}
            />
            <span className="font-bold text-xs uppercase tracking-widest text-[#1C1917]">
              {pendingAction.type === "suspend" && "[ CONFIRM ACCOUNT SUSPENSION ]"}
              {pendingAction.type === "restore" && "[ CONFIRM ACCOUNT RESTORATION ]"}
              {pendingAction.type === "delete" && "[ CONFIRM SOFT-DELETE & SCRUB PII ]"}
            </span>
          </div>

          <div className="text-xs text-[#1C1917] space-y-1 bg-white border border-[#E2DDD5] p-3">
            <div>
              Target Member: <strong>{pendingAction.userName}</strong>
            </div>
            <div className="text-[#57534E]">
              Email: <code>{pendingAction.email}</code>
            </div>
            <div className="text-[#57534E]">
              ID: <code>{pendingAction.userId}</code>
            </div>
          </div>

          <p className="text-xs text-[#57534E] leading-relaxed">
            {pendingAction.type === "suspend" && (
              <>
                <strong>Effect:</strong> Immediately blocks active sessions, denies future sign-in, hides all listed tools, and cancels pending loan requests. The email remains bound in the system so they cannot create a new account with the same email.
              </>
            )}
            {pendingAction.type === "restore" && (
              <>
                <strong>Effect:</strong> Re-enables account access and restores member borrowing/lending clearance.
              </>
            )}
            {pendingAction.type === "delete" && (
              <>
                <strong>Effect:</strong> Permanently anonymizes name to &quot;Deleted User&quot;, overwrites email to a mangled format, archives all listings, and frees the original email address so the member can register a brand new account cleanly. <em>Requires all active/approved loans to be returned first.</em>
              </>
            )}
          </p>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleExecutePendingAction}
              className={`px-3 py-1.5 text-xs font-mono uppercase tracking-widest font-semibold text-white rounded-none transition-all active:translate-y-[1px] disabled:opacity-50 ${
                pendingAction.type === "restore"
                  ? "bg-[#2D6A4F] hover:bg-[#1C1917]"
                  : "bg-[#D95D39] hover:bg-[#1C1917]"
              }`}
            >
              {isSubmitting
                ? "[ Processing... ]"
                : pendingAction.type === "suspend"
                ? "[ Suspend User ]"
                : pendingAction.type === "restore"
                ? "[ Restore User ]"
                : "[ Soft-Delete User ]"}
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setPendingAction(null)}
              className="px-3 py-1.5 text-xs font-mono uppercase tracking-widest border border-[#E2DDD5] bg-white hover:border-[#1C1917] text-[#1C1917] rounded-none transition-all"
            >
              [ Cancel ]
            </button>
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse font-mono text-xs">
          <thead>
            <tr className="border-b border-[#1C1917] bg-[#F7F5F0] text-[10px] uppercase tracking-widest text-[#57534E]">
              <th className="p-3 font-semibold whitespace-nowrap">User</th>
              <th className="p-3 font-semibold whitespace-nowrap">Email</th>
              <th className="p-3 font-semibold whitespace-nowrap">Role</th>
              <th className="p-3 font-semibold whitespace-nowrap">Status</th>
              <th className="p-3 font-semibold whitespace-nowrap">Trusted</th>
              <th className="p-3 font-semibold text-right whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2DDD5]/70">
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-[#57534E] font-mono text-sm">
                  No users found matching query.
                </td>
              </tr>
            ) : (
              filteredUsers.map((user) => {
                const userStatus = user.status ?? "active";
                const isSelf = user._id === currentUser?._id;
                const isDeleted = userStatus === "deleted";
                const isSuspended = userStatus === "suspended";

                return (
                  <tr
                    key={user._id}
                    onClick={() => {
                      if (onSelectUser) {
                        onSelectUser({
                          _id: user._id,
                          name: user.name,
                          role: user.role,
                          lent: 0,
                          borrowed: 0,
                          late: 0,
                          trusted: user.trustedLender,
                          status: userStatus,
                        });
                      }
                    }}
                    className="cursor-pointer hover:bg-[#F7F5F0]/60 transition-colors"
                  >
                    <td className="p-3">
                      <div className="font-bold text-[#1C1917] uppercase">
                        {user.name}
                      </div>
                      <div className="text-[10px] text-[#57534E]">
                        #{user._id}
                      </div>
                    </td>
                    <td className="p-3 text-[#57534E] max-w-[200px] truncate whitespace-nowrap" title={user.email}>
                      {user.email}
                    </td>
                    <td className="p-3">
                      <span
                        className={`font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 font-semibold border whitespace-nowrap ${
                          user.role === "admin"
                            ? "bg-[#1C1917] text-white border-[#1C1917]"
                            : "bg-white text-[#57534E] border-[#E2DDD5]"
                        }`}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td className="p-3">
                      {userStatus === "active" ? (
                        <span className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 font-bold border border-[#2D6A4F] text-[#2D6A4F] bg-[#2D6A4F]/10 whitespace-nowrap">
                          [ ACTIVE ]
                        </span>
                      ) : userStatus === "suspended" ? (
                        <span className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 font-bold border border-[#D95D39] text-[#D95D39] bg-[#D95D39]/10 whitespace-nowrap">
                          [ SUSPENDED ]
                        </span>
                      ) : (
                        <span className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 font-bold border border-[#57534E] text-[#57534E] bg-[#57534E]/10 whitespace-nowrap">
                          [ DELETED ]
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      {user.trustedLender ? (
                        <StatusBadge variant="verified" label="TRUSTED" />
                      ) : (
                        <span className="text-[#57534E] text-[11px]">—</span>
                      )}
                    </td>
                    <td
                      className="p-3 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {isDeleted ? (
                        <span className="text-[10px] font-mono text-[#57534E] italic whitespace-nowrap">
                          [ Anonymized ]
                        </span>
                      ) : (
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          {isSelf && (
                            <span className="text-[10px] font-mono text-[#57534E] italic mr-1 whitespace-nowrap">
                              [ You ]
                            </span>
                          )}

                          {!isSelf && (
                            isSuspended ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setPendingAction({
                                    type: "restore",
                                    userId: user._id,
                                    userName: user.name,
                                    email: user.email,
                                  })
                                }
                                className="bg-[#2D6A4F] text-white hover:bg-[#1C1917] border border-[#2D6A4F] hover:border-[#1C1917] px-2 py-1 text-[10px] uppercase tracking-widest font-semibold transition-all active:translate-y-[1px] whitespace-nowrap"
                              >
                                [ Restore ]
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  setPendingAction({
                                    type: "suspend",
                                    userId: user._id,
                                    userName: user.name,
                                    email: user.email,
                                  })
                                }
                                className="border border-[#D95D39] text-[#D95D39] hover:bg-[#D95D39] hover:text-white px-2 py-1 text-[10px] uppercase tracking-widest font-semibold transition-all active:translate-y-[1px] whitespace-nowrap"
                              >
                                [ Suspend ]
                              </button>
                            )
                          )}

                          {!isSelf && (
                            <button
                              type="button"
                              onClick={() =>
                                setPendingAction({
                                  type: "delete",
                                  userId: user._id,
                                  userName: user.name,
                                  email: user.email,
                                })
                              }
                              className="border border-[#1C1917] text-[#1C1917] hover:bg-[#1C1917] hover:text-white px-2 py-1 text-[10px] uppercase tracking-widest font-semibold transition-all active:translate-y-[1px] whitespace-nowrap"
                            >
                              [ Delete ]
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleToggleTrusted(user._id, user.trustedLender, user.name)}
                            className="border border-[#E2DDD5] hover:border-[#1C1917] text-[#57534E] hover:text-[#1C1917] px-2 py-1 text-[10px] uppercase tracking-widest transition-all active:translate-y-[1px] whitespace-nowrap"
                          >
                            {user.trustedLender ? "[ Revoke Trust ]" : "[ Make Trusted ]"}
                          </button>

                          <button
                            type="button"
                            disabled={isSelf || userStatus !== "active" || submittingRoleId === user._id}
                            onClick={() => handleToggleRole(user._id, user.role, user.name)}
                            className="border border-[#E2DDD5] hover:border-[#1C1917] text-[#57534E] hover:text-[#1C1917] px-2 py-1 text-[10px] uppercase tracking-widest transition-all active:translate-y-[1px] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-[#E2DDD5] disabled:hover:text-[#57534E] whitespace-nowrap"
                            title={
                              isSelf
                                ? "Cannot demote your own account"
                                : userStatus !== "active"
                                ? "Cannot change role of a suspended or deleted user"
                                : undefined
                            }
                          >
                            {submittingRoleId === user._id
                              ? "[ Updating... ]"
                              : user.role === "admin"
                              ? "[ Demote ]"
                              : "[ Promote ]"}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
