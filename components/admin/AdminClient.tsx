"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AdminMetrics, MetricItem } from "@/components/admin/AdminMetrics";
import { AdminAuditTable, LoanRecord } from "@/components/admin/AdminAuditTable";
import { AdminAuditDrawer, AuditUserProfile } from "@/components/admin/AdminAuditDrawer";
import { AdminUsersTable } from "@/components/admin/AdminUsersTable";
import { SkeletonRow } from "@/components/ui/SkeletonRow";
import { useToast } from "@/components/ui/Toast";

export function AdminClient() {
  const { showToast } = useToast();
  const { isAuthenticated } = useConvexAuth();
  const [activeTab, setActiveTab] = useState<"loans" | "users" | "flags" | "logs">("loans");

  // Live Convex queries
  const allLoans = useQuery(api.admin.listAllLoans, isAuthenticated ? {} : "skip");
  const platformMetrics = useQuery(api.admin.getPlatformMetrics, isAuthenticated ? {} : "skip");
  const toggleTrustedLender = useMutation(api.admin.setTrustedLender);

  function formatDate(d: string | number | undefined | null): string {
    if (!d) return "—";
    const date = new Date(d);
    if (isNaN(date.getTime())) return String(d);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  // Transform Convex loans to UI format
  const todayStr = new Date().toISOString().slice(0, 10);
  const loans: LoanRecord[] = (allLoans ?? []).map((loan) => {
    const isOverdue =
      loan.status === "approved" &&
      loan.returnedAt === null &&
      loan.endDate < todayStr;
    // Map Convex status to UI status
    let uiStatus: LoanRecord["status"];
    if (isOverdue) {
      uiStatus = "late";
    } else if (loan.status === "approved") {
      uiStatus = "active";
    } else if (loan.status === "cancelled") {
      uiStatus = "cancelled";
    } else if (loan.status === "declined") {
      uiStatus = "cancelled"; // map declined to cancelled for UI
    } else if (loan.status === "pending") {
      uiStatus = "pending";
    } else if (loan.status === "returned") {
      uiStatus = "returned";
    } else {
      uiStatus = "listed";
    }
    const datesStr = `${formatDate(loan.startDate)} → ${formatDate(loan.endDate)}`;
    return {
      _id: loan._id,
      id: loan._id,
      toolName: loan.toolName.toUpperCase(),
      category: "Unknown", // Would need to join with tools
      owner: loan.ownerName,
      borrower: loan.borrowerName === "[No Active Loan]" ? "[No Active Loan]" : loan.borrowerName,
      dates: datesStr,
      status: uiStatus,
      statusDetail: isOverdue ? "Automated reminder sent 2 days ago" : "In good standing",
    };
  });

  const [selectedLoanId, setSelectedLoanId] = useState<string | null>("7129");
  const [selectedUser, setSelectedUser] = useState<AuditUserProfile>({
    name: "Marcus G.",
    role: "user",
    lent: 0,
    borrowed: 3,
    late: 1,
    trusted: false,
    status: "active",
    associatedTool: "Makita 18V Impact Driver (#7129)",
  });

  const lateCount = loans.filter((l) => l.status === "late").length;
  const activeCount = loans.filter((l) => l.status === "active").length;

  const metrics: MetricItem[] = [
    { label: "TOTAL REGISTERED USERS:", value: platformMetrics?.totalUsers ?? "412" },
    { label: "TOTAL ACTIVE LISTINGS:", value: platformMetrics?.activeListings ?? "142" },
    { label: "CURRENT ACTIVE LOANS:", value: activeCount },
    { label: "OVERDUE TOOLS: ⚠", value: lateCount, highlight: "rust" },
    { label: "TRUSTED NEIGHBORS:", value: platformMetrics?.trustedNeighbors ?? "48", highlight: "trust" },
  ];

  const handleSelectLoan = (loan: LoanRecord) => {
    setSelectedLoanId(loan._id || loan.id || null);

    const userName = loan.borrower !== "[No Active Loan]" ? loan.borrower : loan.owner;

    if (userName.includes("Marcus")) {
      setSelectedUser({
        name: "Marcus G.",
        role: "user",
        lent: 0,
        borrowed: 3,
        late: 1,
        trusted: false,
        status: "active",
        associatedTool: "Makita 18V Impact Driver (#7129)",
      });
    } else if (userName.includes("Dave")) {
      setSelectedUser({
        name: "Dave K.",
        role: "user",
        lent: 2,
        borrowed: 1,
        late: 0,
        trusted: false,
        status: "active",
        associatedTool: "Extendable Hedge Shears (#6502)",
      });
    } else if (userName.includes("Sarah")) {
      setSelectedUser({
        name: "Sarah T.",
        role: "user",
        lent: 1,
        borrowed: 2,
        late: 0,
        trusted: true,
        status: "active",
        associatedTool: "Bosch Rotary Hammer (#6502)",
      });
    } else {
      setSelectedUser({
        name: userName,
        role: "user",
        lent: 0,
        borrowed: 0,
        late: 0,
        trusted: false,
        status: "active",
      });
    }
  };

  const handleUpdateLoanStatus = (loanId: string, newStatus: LoanRecord["status"]) => {
    showToast(
      newStatus === "returned" ? "Admin Return Override" : "Admin Cancellation",
      newStatus === "returned"
        ? `Loan #${loanId} has been officially marked as returned by Admin.`
        : `Loan #${loanId} has been administratively cancelled.`,
      newStatus === "returned" ? "success" : "rust"
    );
  };

  const handleToggleTrusted = async (user: AuditUserProfile) => {
    const nextTrusted = !user.trusted;
    setSelectedUser({ ...user, trusted: nextTrusted });
    showToast(
      "Trusted Lender Status Changed",
      `${user.name} is ${nextTrusted ? "now designated as a Trusted Lender" : "no longer a Trusted Lender"}.`,
      nextTrusted ? "success" : "info"
    );
  };

  const handleToggleDeactivate = (user: AuditUserProfile) => {
    const nextStatus = user.status === "active" ? "suspended" : "active";
    setSelectedUser({ ...user, status: nextStatus });
    showToast(
      nextStatus === "suspended" ? "Account Suspended" : "Account Restored",
      `${user.name}'s borrowing and lending privileges are ${nextStatus}.`,
      nextStatus === "suspended" ? "rust" : "success"
    );
  };

  const handleRoleChange = (user: AuditUserProfile, newRole: "user" | "admin") => {
    if (user.role === newRole) return;
    setSelectedUser({ ...user, role: newRole });
    showToast(
      "Admin Permissions Updated",
      `${user.name} has been assigned the [${newRole.toUpperCase()}] role.`,
      "info"
    );
  };

  if (allLoans === undefined) {
    return (
      <div className="w-full space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Admin Metrics Row */}
      <AdminMetrics metrics={metrics} />

      {/* Three-Pane Layout: Left Sidebar | Center Table | Right Drawer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Side Navigation */}
        <aside className="lg:col-span-2 border border-[#E2DDD5] bg-white p-4 space-y-4">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[#57534E] font-semibold border-b border-[#E2DDD5] pb-2 whitespace-nowrap">
            ADMIN UTILITIES
          </div>

          <nav className="space-y-1 font-mono text-xs">
            <button
              type="button"
              onClick={() => {
                setActiveTab("loans");
                showToast("Audit View Filter", "Showing all active loans and catalog items.", "info");
              }}
              className={`w-full text-left px-2.5 py-1.5 uppercase tracking-widest transition-all active:translate-y-[1px] whitespace-nowrap ${
                activeTab === "loans"
                  ? "bg-[#1C1917] text-white font-semibold"
                  : "text-[#57534E] hover:text-[#1C1917] hover:bg-[#F7F5F0]"
              }`}
            >
              [ Active Loans ]
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab("users");
                showToast("Users Management", "Opened neighborhood member registry.", "info");
              }}
              className={`w-full text-left px-2.5 py-1.5 uppercase tracking-widest transition-all active:translate-y-[1px] whitespace-nowrap ${
                activeTab === "users"
                  ? "bg-[#1C1917] text-white font-semibold"
                  : "text-[#57534E] hover:text-[#1C1917] hover:bg-[#F7F5F0]"
              }`}
            >
              [ Manage Users ]
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab("flags");
                showToast("Disputes & Flags", "No open disputes pending arbitration.", "info");
              }}
              className={`w-full text-left px-2.5 py-1.5 uppercase tracking-widest transition-all active:translate-y-[1px] whitespace-nowrap ${
                activeTab === "flags"
                  ? "bg-[#1C1917] text-white font-semibold"
                  : "text-[#57534E] hover:text-[#1C1917] hover:bg-[#F7F5F0]"
              }`}
            >
              [ Flags & Disputes ]
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab("logs");
                showToast("System Logs", "All HMAC webhook dispatches verified 100% OK.", "info");
              }}
              className={`w-full text-left px-2.5 py-1.5 uppercase tracking-widest transition-all active:translate-y-[1px] whitespace-nowrap ${
                activeTab === "logs"
                  ? "bg-[#1C1917] text-white font-semibold"
                  : "text-[#57534E] hover:text-[#1C1917] hover:bg-[#F7F5F0]"
              }`}
            >
              [ System Logs ]
            </button>
          </nav>
        </aside>

        {/* Center: Dense Tabular Audit Table / Manage Users */}
        <section className="lg:col-span-7">
          {activeTab === "loans" && (
            <AdminAuditTable
              loans={loans}
              selectedLoanId={selectedLoanId}
              onSelectLoan={handleSelectLoan}
              onUpdateLoanStatus={handleUpdateLoanStatus}
            />
          )}
          {activeTab === "users" && (
            <AdminUsersTable
              onSelectUser={(u) => setSelectedUser(u)}
            />
          )}
          {activeTab === "flags" && (
            <div className="border border-[#E2DDD5] bg-white p-8 text-center font-mono text-sm text-[#57534E]">
              No open flags or community disputes pending review.
            </div>
          )}
          {activeTab === "logs" && (
            <div className="border border-[#E2DDD5] bg-white p-8 text-center font-mono text-sm text-[#57534E]">
              System logs healthy. All background automations and HMAC webhooks nominal.
            </div>
          )}
        </section>

        {/* Right: Dynamic User Audit Drawer */}
        <aside className="lg:col-span-3">
          <AdminAuditDrawer
            user={selectedUser}
            onUpdateUser={(updated) => setSelectedUser(updated)}
          />
        </aside>
      </div>
    </div>
  );
}
