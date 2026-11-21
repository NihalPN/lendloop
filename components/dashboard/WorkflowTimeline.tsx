"use client";

import React, { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";

interface BorrowedItem {
  _id: string;
  id?: string;
  toolName: string;
  ownerName: string;
  startDate: string;
  endDate: string;
  decidedAt?: number;
  status: "pending" | "approved" | "returned" | "overdue";
  isOverdue?: boolean;
  returnedAt?: number | null;
}

interface IncomingRequest {
  _id: string;
  id?: string;
  toolName: string;
  category: string;
  borrowerName: string;
  startDate: string;
  endDate: string;
  decidedAt?: number;
  status: "pending" | "approved" | "declined" | "cancelled" | "returned" | "overdue";
  returnedAt?: number | null;
  isOverdue?: boolean;
  note?: string;
}

interface WorkflowTimelineProps {
  myLoans: BorrowedItem[];
  incomingLoans: IncomingRequest[];
  activeTab: "requests" | "inbox";
}

function formatDisplayDate(dateVal?: number | string | null): string {
  if (!dateVal) return "N/A";
  if (typeof dateVal === "number") {
    const d = new Date(dateVal);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }
  }
  const str = String(dateVal);
  const d = new Date(str.includes("T") ? str : str + "T00:00:00");
  if (!isNaN(d.getTime())) {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  return str;
}

export function WorkflowTimeline({ myLoans, incomingLoans, activeTab }: WorkflowTimelineProps) {
  const { showToast } = useToast();
  const [loadingActionId, setLoadingActionId] = useState<string | null>(null);

  const markReturned = useMutation(api.loans.markReturned);
  const approveLoan = useMutation(api.loans.approve);
  const declineLoan = useMutation(api.loans.decline);
  const cancelLoan = useMutation(api.loans.cancel);

  const handleMarkReturned = async (id: string, toolName: string, counterpartyName: string) => {
    setLoadingActionId(id);
    try {
      await markReturned({ loanId: id as any });
      showToast(
        "Tool Marked as Returned",
        `Receipt logged for ${toolName}.`,
        "success"
      );
    } catch (error) {
      showToast("Error", "Failed to mark as returned. Please try again.", "rust");
    } finally {
      setLoadingActionId(null);
    }
  };

  const handleCancelRequest = async (id: string, toolName: string) => {
    try {
      await cancelLoan({ loanId: id as any });
      showToast(
        "Reservation Cancelled",
        `Your request for ${toolName} has been withdrawn.`,
        "info"
      );
    } catch (error) {
      showToast("Error", "Failed to cancel request. Please try again.", "rust");
    }
  };

  const handleApprove = async (id: string, toolName: string, borrowerName: string) => {
    setLoadingActionId(id);
    try {
      await approveLoan({ loanId: id as any });
      showToast(
        "Request Approved",
        `${borrowerName} can now pick up ${toolName}.`,
        "success"
      );
    } catch (error) {
      showToast("Error", "Failed to approve request. Please try again.", "rust");
    } finally {
      setLoadingActionId(null);
    }
  };

  const handleDecline = async (id: string, toolName: string) => {
    try {
      await declineLoan({ loanId: id as any });
      showToast(
        "Request Declined",
        `You declined the request for ${toolName}.`,
        "rust"
      );
    } catch (error) {
      showToast("Error", "Failed to decline request. Please try again.", "rust");
    }
  };

  const activeBorrowing = myLoans;
  const incomingRequests = incomingLoans;
  const isLoading = loadingActionId !== null;

  if (activeTab === "requests") {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-serif text-xl font-bold tracking-tight text-[#1C1917] uppercase">
              My Active Borrowing
            </h3>
            <p className="text-[#57534E] font-mono text-xs uppercase tracking-widest">
              Track the tools you've borrowed and their status
            </p>
          </div>
        </div>

        <div className="border border-[#E2DDD5] bg-white overflow-hidden">
          <div className="grid grid-cols-[1fr_auto] border-b border-[#E2DDD5] bg-[#F7F5F0] px-4 py-2.5 font-mono text-[10px] uppercase tracking-widest text-[#57534E]">
            <span>TOOL / LENDER</span>
            <span className="text-center w-28">DATES</span>
            <span className="text-center w-24">STATUS</span>
            <span className="text-center w-28">ACTION</span>
          </div>

          <div className="divide-y divide-[#E2DDD5]">
            {activeBorrowing.length === 0 && (
              <div className="col-span-full py-12 text-center text-[#57534E] font-mono text-sm border border-dashed border-[#E2DDD5]">
                No items found.
              </div>
            )}
            {activeBorrowing.map((item) => {
              const itemId = item._id || item.id || "";
              const todayStr = new Date().toISOString().slice(0, 10);
              const isItemOverdue = Boolean(
                item.isOverdue ||
                (item.status === "approved" &&
                  !item.returnedAt &&
                  item.endDate < todayStr)
              );

              return (
                <div key={itemId} className="grid grid-cols-[1fr_auto] px-4 py-3 gap-4 items-center">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <StatusBadge
                        variant={
                          isItemOverdue
                            ? "overdue"
                            : item.status === "approved"
                            ? "available"
                            : item.status === "pending"
                            ? "pending"
                            : "returned"
                        }
                        label={
                          isItemOverdue
                            ? "OVERDUE"
                            : item.status === "approved"
                            ? "ACTIVE LOAN"
                            : item.status.charAt(0).toUpperCase() + item.status.slice(1)
                        }
                      />
                      {isItemOverdue && (
                        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#D95D39] border border-[#D95D39] px-1.5 py-0.5 bg-[#D95D39]/10">
                          [ OVERDUE ]
                        </span>
                      )}
                    </div>
                    <h4 className="font-serif text-xl font-bold tracking-tight text-[#1C1917] uppercase truncate">
                      {item.toolName}
                    </h4>
                    <div className="flex items-center gap-2 font-mono text-xs text-[#57534E] mt-1">
                      <span>
                        Lender: <strong className="text-[#1C1917]">{item.ownerName}</strong>
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-center shrink-0">
                    <div className="text-center w-full sm:w-44 font-mono text-xs text-[#57534E]">
                      <div className="text-[9px] uppercase tracking-wider text-[#57534E]">
                        LOCKED PERIOD
                      </div>
                      <div className="text-[11px] font-bold text-[#1C1917] mt-0.5 whitespace-nowrap">
                        {formatDisplayDate(item.startDate)} → {formatDisplayDate(item.endDate)}
                      </div>
                    </div>

                    <div className="text-center w-full sm:w-20">
                      <StatusBadge
                        variant={
                          isItemOverdue
                            ? "overdue"
                            : item.status === "approved"
                            ? "available"
                            : item.status === "pending"
                            ? "pending"
                            : "returned"
                        }
                        label=""
                      />
                    </div>

                    <div className="flex gap-2 justify-center w-full sm:w-28 shrink-0">
                      {
                        (item.status === "overdue" || (item.status === "approved" && !item.returnedAt)) ? (
                          <span className="w-full text-center font-mono text-[10px] uppercase tracking-wider text-[#57534E] border border-[#E2DDD5] bg-[#F7F5F0] px-2.5 py-1.5 inline-block font-semibold">
                            {isItemOverdue ? "[ RETURN DUE ]" : "[ IN POSSESSION ]"}
                          </span>
                      ) : item.status === "pending" ? (
                          <button
                            type="button"
                            disabled={loadingActionId === itemId}
                            onClick={() => handleCancelRequest(itemId, item.toolName)}
                            className="w-full border border-[#E2DDD5] hover:border-[#D95D39] text-[#57534E] hover:text-[#D95D39] px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest transition-colors active:translate-y-[1px]"
                          >
                            [ Cancel Request ]
                          </button>
                      ) : (
                          <span className="w-full text-center font-mono text-[10px] text-[#57534E] border border-[#E2DDD5] bg-[#F7F5F0] px-3 py-1.5 inline-block">
                            Completed
                          </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (activeTab === "inbox") {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-serif text-xl font-bold tracking-tight text-[#1C1917] uppercase">
              Incoming Requests (Lending your tools)
            </h3>
            <p className="text-[#57534E] font-mono text-xs uppercase tracking-widest">
              Review and approve borrowing requests from neighbors
            </p>
          </div>
        </div>

        <div className="border border-[#E2DDD5] bg-white overflow-hidden">
          <div className="grid grid-cols-[1fr_auto] border-b border-[#E2DDD5] bg-[#F7F5F0] px-4 py-2.5 font-mono text-[10px] uppercase tracking-widest text-[#57534E]">
            <span>TOOL / BORROWER</span>
            <span className="text-right">PROPOSED WINDOW & ACTION</span>
          </div>

          <div className="divide-y divide-[#E2DDD5]">
            {incomingRequests.length === 0 && (
              <div className="col-span-full py-12 text-center text-[#57534E] font-mono text-sm border border-dashed border-[#E2DDD5]">
                No items found.
              </div>
            )}
            {incomingRequests.map((req) => {
              const reqId = req._id || req.id || "";
              const startMs = new Date(`${req.startDate}T00:00:00`).getTime();
              const endMs = new Date(`${req.endDate}T00:00:00`).getTime();
              const daysDiff = Math.max(1, Math.round((endMs - startMs) / 86400000));
              const proposedDatesFormatted = `${formatDisplayDate(req.startDate)} → ${formatDisplayDate(req.endDate)} (${daysDiff} days)`;
              return (
                <div key={reqId} className="grid grid-cols-[1fr_auto] px-4 py-3 gap-4 items-center">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <StatusBadge
                        variant={
                          req.status === "approved"
                            ? "available"
                            : req.status === "pending"
                            ? "pending"
                            : "returned"
                        }
                        label={req.status.toUpperCase()}
                      />
                    </div>
                    <h4 className="font-serif text-xl font-bold tracking-tight text-[#1C1917] uppercase truncate">
                      {req.toolName}
                    </h4>
                    <div className="flex items-center gap-2 font-mono text-xs text-[#57534E] mt-1">
                      <span>
                        Borrower: <strong className="text-[#1C1917]">{req.borrowerName}</strong>
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2.5 shrink-0">
                    {req.status === "pending" ? (
                      <div className="font-mono text-xs text-[#1C1917] bg-[#F7F5F0] border border-[#E2DDD5] px-3 py-1.5 text-right whitespace-nowrap">
                        <span className="text-[#57534E] text-[9px] block uppercase tracking-wider font-semibold">
                          PROPOSED DATES:
                        </span>
                        <span className="font-bold text-[#1C1917] text-xs">
                          {proposedDatesFormatted}
                        </span>
                      </div>
                    ) : (req.status === "approved" || req.status === "overdue") ? (
                      <div className="font-mono text-xs text-[#1C1917] bg-[#F7F5F0] border border-[#E2DDD5] px-3 py-1.5 text-right whitespace-nowrap">
                        <span className="text-[#57534E] text-[9px] block uppercase tracking-wider font-semibold">
                          LENT WINDOW:
                        </span>
                        <span className="font-bold text-[#1C1917] text-xs">
                          {formatDisplayDate(req.startDate)} → {formatDisplayDate(req.endDate)}
                        </span>
                      </div>
                    ) : null}

                    <div className="flex items-center gap-2 justify-end w-full">
                      {req.status === "pending" ? (
                        <>
                          <button
                            type="button"
                            disabled={loadingActionId === reqId}
                            onClick={() => handleApprove(reqId, req.toolName, req.borrowerName)}
                            className="bg-[#2D6A4F] text-white hover:bg-[#1C1917] border border-[#2D6A4F] hover:border-[#1C1917] px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest font-semibold rounded-none transition-all active:translate-y-[1px] disabled:opacity-50"
                          >
                            [ Accept ]
                          </button>
                          <button
                            type="button"
                            disabled={loadingActionId === reqId}
                            onClick={() => handleDecline(reqId, req.toolName)}
                            className="border border-[#E2DDD5] hover:border-[#D95D39] text-[#57534E] hover:text-[#D95D39] px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest transition-colors active:translate-y-[1px] disabled:opacity-50"
                          >
                            [ Reject ]
                          </button>
                        </>
                      ) : (req.status === "approved" || req.status === "overdue") && !req.returnedAt ? (
                        <button
                          type="button"
                          disabled={loadingActionId === reqId}
                          onClick={() => handleMarkReturned(reqId, req.toolName, req.borrowerName)}
                          className="bg-[#2D6A4F] text-white hover:bg-[#1C1917] border border-[#2D6A4F] hover:border-[#1C1917] px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest font-semibold rounded-none transition-all active:translate-y-[1px] disabled:opacity-50 flex items-center justify-center gap-1.5"
                        >
                          {loadingActionId === reqId ? (
                            <>
                              <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                              <span>[ Returning... ]</span>
                            </>
                          ) : (
                            <span>[ Mark Returned ]</span>
                          )}
                        </button>
                      ) : (
                        <span className="font-mono text-[10px] text-[#57534E] border border-[#E2DDD5] bg-[#F7F5F0] px-3 py-1.5 inline-block">
                          {req.status === "returned" ? "RETURNED" : req.status.toUpperCase()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="col-span-full py-12 text-center text-[#57534E] font-mono text-sm border border-dashed border-[#E2DDD5]">
      No items found.
    </div>
  );
}
