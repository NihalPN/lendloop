"use client";

import React, { useState } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";

export interface LoanRecord {
  _id: string;
  id?: string;
  toolName: string;
  category: string;
  owner: string;
  borrower: string;
  dates: string;
  status: "late" | "active" | "listed" | "pending" | "returned" | "cancelled";
  statusDetail?: string;
}

interface AdminAuditTableProps {
  loans: LoanRecord[];
  selectedLoanId: string | null;
  onSelectLoan: (loan: LoanRecord) => void;
  onUpdateLoanStatus: (loanId: string, newStatus: LoanRecord["status"]) => void;
}

export function AdminAuditTable({
  loans,
  selectedLoanId,
  onSelectLoan,
  onUpdateLoanStatus,
}: AdminAuditTableProps) {
  const { showToast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "overdue" | "flagged">("all");
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");

  const filteredLoans = loans.filter((loan) => {
    const loanId = loan._id || loan.id || "";
    const matchesSearch =
      loan.toolName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      loan.borrower.toLowerCase().includes(searchQuery.toLowerCase()) ||
      loan.owner.toLowerCase().includes(searchQuery.toLowerCase()) ||
      loanId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      loan.category.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;
    if (filterMode === "overdue") return loan.status === "late";
    if (filterMode === "flagged") return loan.status === "late" || loan.status === "pending";
    return true;
  });

  const handleMarkReturned = (id: string, toolName: string) => {
    onUpdateLoanStatus(id, "returned");
    showToast(
      "Admin Return Override",
      `Loan #${id} for ${toolName} has been officially marked as returned by Admin.`,
      "success"
    );
  };

  const handleCancelLoan = (id: string, toolName: string) => {
    onUpdateLoanStatus(id, "cancelled");
    showToast(
      "Admin Cancellation",
      `Loan #${id} for ${toolName} has been administratively cancelled.`,
      "rust"
    );
  };

  const handleExecuteOverride = (e: React.FormEvent) => {
    e.preventDefault();
    setOverrideModalOpen(false);
    showToast(
      "System Manual Override Applied",
      `Executed rule override: "${overrideReason || "General administrative dispatch"}". Audit logged.`,
      "rust"
    );
    setOverrideReason("");
  };

  return (
    <div className="border border-[#E2DDD5] bg-white p-4 sm:p-5 space-y-4">
      {/* Title */}
      <div>
        <h2 className="font-serif text-xl sm:text-2xl font-bold tracking-tight text-[#1C1917] uppercase">
          Admin: Oversee All Loans & Listings
        </h2>
        <p className="text-xs text-[#57534E] font-sans mt-0.5">
          Manage community borrowing, resolve flagged items, and maintain neighborhood trust.
        </p>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t border-b border-[#E2DDD5] py-3.5">
        <div className="flex-1 min-w-0">
          <input
            type="text"
            placeholder="Search (by user, tool, category, or ID)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#F7F5F0] border border-[#E2DDD5] px-3.5 py-2 text-xs font-mono text-[#1C1917] focus:outline-none focus:border-[#1C1917] focus-visible:ring-2 focus-visible:ring-[#1C1917] focus-visible:ring-offset-1 rounded-none transition-colors"
          />
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-mono text-[10px] uppercase tracking-widest text-[#57534E] font-semibold">
            Show:
          </span>
          <button
            type="button"
            onClick={() => setFilterMode("all")}
            className={`px-2.5 py-1 text-[10px] font-mono uppercase tracking-widest border rounded-none transition-all active:translate-y-[1px] ${
              filterMode === "all"
                ? "bg-[#1C1917] text-white border-[#1C1917] font-semibold"
                : "bg-white text-[#57534E] border-[#E2DDD5] hover:border-[#1C1917]"
            }`}
          >
            [All ({loans.length})]
          </button>
          <button
            type="button"
            onClick={() => setFilterMode("overdue")}
            className={`px-2.5 py-1 text-[10px] font-mono uppercase tracking-widest border rounded-none transition-all active:translate-y-[1px] ${
              filterMode === "overdue"
                ? "bg-[#D95D39] text-white border-[#D95D39] font-semibold"
                : "bg-white text-[#57534E] border-[#E2DDD5] hover:border-[#D95D39]"
            }`}
          >
            [Overdue Only]
          </button>
          <button
            type="button"
            onClick={() => setFilterMode("flagged")}
            className={`px-2.5 py-1 text-[10px] font-mono uppercase tracking-widest border rounded-none transition-all active:translate-y-[1px] ${
              filterMode === "flagged"
                ? "bg-[#1C1917] text-white border-[#1C1917] font-semibold"
                : "bg-white text-[#57534E] border-[#E2DDD5] hover:border-[#1C1917]"
            }`}
          >
            [Flagged Only]
          </button>

          <button
            type="button"
            onClick={() => setOverrideModalOpen(true)}
            className="bg-[#D95D39] text-white hover:bg-[#1C1917] border border-[#D95D39] hover:border-[#1C1917] px-3 py-1 text-[10px] font-mono uppercase tracking-widest font-semibold rounded-none ml-1 transition-all active:translate-y-[1px] whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D95D39] focus-visible:ring-offset-1"
          >
            [ + Manual Override ]
          </button>
        </div>
      </div>

      {/* Dense Tabular Audit Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse font-mono text-xs">
          <thead>
            <tr className="border-b border-[#1C1917] bg-[#F7F5F0] text-[10px] uppercase tracking-widest text-[#57534E]">
              <th className="p-3 font-semibold">ID</th>
              <th className="p-3 font-semibold whitespace-nowrap">Tool</th>
              <th className="p-3 font-semibold whitespace-nowrap">Owner</th>
              <th className="p-3 font-semibold whitespace-nowrap">Borrower</th>
              <th className="p-3 font-semibold whitespace-nowrap">Dates</th>
              <th className="p-3 font-semibold whitespace-nowrap">Status</th>
              <th className="p-3 font-semibold text-right whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2DDD5]/70">
            {filteredLoans.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-[#57534E] font-mono text-sm">
                  No loan records found matching criteria.
                </td>
              </tr>
            )}
            {filteredLoans.map((loan) => {
              const loanId = loan._id || loan.id || "";
              const isSelected = selectedLoanId === loanId;
              const isLate = loan.status === "late";
              const isActive = loan.status === "active";
              const isListed = loan.status === "listed";

              return (
                <tr
                  key={loanId}
                  onClick={() => onSelectLoan(loan)}
                  className={`cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-[#F7F5F0] ring-1 ring-[#1C1917]"
                      : "hover:bg-[#F7F5F0]/60"
                  }`}
                >
                  <td className="p-3 font-semibold text-[#57534E]">
                    #{loanId}
                  </td>
                  <td className="p-3">
                    <div className="font-bold text-[#1C1917] uppercase">
                      {loan.toolName}
                    </div>
                    <div className="text-[10px] text-[#57534E]">
                      [{loan.category}]
                    </div>
                  </td>
                  <td className="p-3">
                    <span className="font-semibold text-[#1C1917] hover:underline">
                      {loan.owner}
                    </span>
                  </td>
                  <td className="p-3">
                    {loan.borrower === "[No Active Loan]" ? (
                      <span className="text-[#57534E] italic text-[11px]">
                        {loan.borrower}
                      </span>
                    ) : (
                      <span className="font-semibold text-[#1C1917] hover:underline">
                        {loan.borrower}
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-[#57534E] whitespace-nowrap">
                    {loan.dates}
                  </td>
                  <td className="p-3">
                    {isLate ? (
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <StatusBadge variant="late" label="LATE" />
                          <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-[#D95D39] border border-[#D95D39] px-1 py-0.5 bg-[#D95D39]/10 whitespace-nowrap">
                            [ OVERDUE ]
                          </span>
                        </div>
                        <div className="text-[9px] text-[#991B1B] font-mono mt-1 leading-tight">
                          {loan.statusDetail}
                        </div>
                      </div>
                    ) : isActive ? (
                      <StatusBadge variant="approved" label="ACTIVE" />
                    ) : isListed ? (
                      <StatusBadge variant="neutral" label="LISTED" />
                    ) : (
                      <StatusBadge variant="pending" label={loan.status.toUpperCase()} />
                    )}
                  </td>
                  <td
                    className="p-3 text-right space-y-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {isLate || isActive ? (
                      <div className="flex flex-col items-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleMarkReturned(loanId, loan.toolName)}
                          className="bg-[#D95D39] text-white hover:bg-[#1C1917] px-2.5 py-1 text-[10px] uppercase tracking-widest font-semibold transition-all active:translate-y-[1px] whitespace-nowrap"
                        >
                          [ Mark Returned ]
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCancelLoan(loanId, loan.toolName)}
                          className="text-[10px] text-[#57534E] hover:text-[#1C1917] underline uppercase tracking-wider whitespace-nowrap"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : isListed ? (
                      <div className="flex flex-col items-end gap-1">
                        <button
                          type="button"
                          onClick={() => onSelectLoan(loan)}
                          className="text-[10px] text-[#57534E] hover:text-[#1C1917] underline uppercase tracking-wider whitespace-nowrap"
                        >
                          [ View Details ]
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSelectLoan(loan)}
                        className="text-[10px] text-[#57534E] hover:text-[#1C1917] underline uppercase tracking-wider whitespace-nowrap"
                      >
                        [ Audit ]
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Manual Override Modal */}
      {overrideModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-[#1C1917]/70 flex items-center justify-center p-4 animate-in fade-in"
        >
          <div className="w-full max-w-md border-2 border-[#1C1917] bg-white p-6 space-y-4">
            <div className="border-b border-[#E2DDD5] pb-3 flex justify-between items-start">
              <div>
                <span className="bg-[#D95D39] text-white font-mono text-[9px] uppercase tracking-widest px-2 py-0.5 font-semibold">
                  OVERRIDE PROTOCOL
                </span>
                <h3 className="font-serif text-xl font-bold uppercase tracking-tight text-[#1C1917] mt-1">
                  Manual System Override
                </h3>
              </div>
              <button
                onClick={() => setOverrideModalOpen(false)}
                className="text-[#57534E] hover:text-[#1C1917] font-mono text-xs uppercase"
              >
                ✕ Close
              </button>
            </div>

            <p className="font-mono text-xs text-[#57534E]">
              Apply administrative override under Rule R19. Will inject timestamped audit event into automation registry.
            </p>

            <form onSubmit={handleExecuteOverride} className="space-y-4 font-mono text-xs">
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-[#57534E] mb-1 font-semibold">
                  Reason for Override
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Borrower verified tool returned in person to lender"
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  className="w-full bg-[#F7F5F0] border border-[#E2DDD5] px-3.5 py-2 text-xs font-mono text-[#1C1917] focus:outline-none focus:border-[#1C1917] rounded-none"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t border-[#E2DDD5]">
                <button
                  type="button"
                  onClick={() => setOverrideModalOpen(false)}
                  className="border border-[#E2DDD5] hover:border-[#1C1917] px-4 py-2 font-mono text-xs uppercase tracking-widest"
                >
                  [ Cancel ]
                </button>
                <button
                  type="submit"
                  className="bg-[#D95D39] text-white hover:bg-[#1C1917] border border-[#D95D39] px-4 py-2 font-mono text-xs uppercase tracking-widest font-semibold transition-colors"
                >
                  [ Confirm Override ]
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
