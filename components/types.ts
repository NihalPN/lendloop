/**
 * Type adapters between Convex backend and frontend UI components.
 * Convex returns _id as Id<"tools">, etc. - these are string-compatible.
 */

import type { ToolProjection, PublicToolProjection, LoanProjection } from "@/convex/lib/projections";

// Tool types for UI components
export interface UITool {
  _id: string;
  id?: string;
  name: string;
  category: string;
  condition: "new" | "good" | "fair" | "worn";
  distance: string;
  ownerName: string;
  available: boolean;
  isMine?: boolean;
  ownerTrusted?: boolean;
  description?: string;
}

// Loan types for UI components
export interface UILoan {
  _id: string;
  id?: string;
  toolName: string;
  ownerName: string;
  borrowerName: string;
  startDate: string;
  endDate: string;
  decidedAt?: number;
  status: "pending" | "approved" | "declined" | "cancelled" | "returned" | "overdue";
  returnedAt: number | null;
  counterpartyName: string;
}

// BorrowedItem for WorkflowTimeline (borrower view)
export interface BorrowedItem {
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

// IncomingRequest for WorkflowTimeline (owner view)
export interface IncomingRequest {
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

// Admin types
export interface AdminLoanRecord {
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

export interface AdminAuditUserProfile {
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

// Type adapters
export function adaptPublicTool(t: PublicToolProjection): UITool {
  return {
    _id: t._id,
    id: t._id,
    name: t.name,
    category: t.category.replace("_", " "),
    condition: "good", // Not in public projection
    distance: "0.2 mi", // Not in public projection
    ownerName: "Neighbor", // Not in public projection
    available: t.available,
  };
}

export function adaptTool(t: ToolProjection): UITool {
  return {
    _id: t._id,
    id: t._id,
    name: t.name,
    category: t.category.replace("_", " "),
    condition: t.condition,
    distance: "0.2 mi", // Would need to be added to projection
    ownerName: "Owner", // Would need owner name in projection
    available: t.available,
    isMine: t.isMine,
    ownerTrusted: t.ownerTrusted,
  };
}

export function adaptLoan(l: LoanProjection): UILoan {
  return {
    _id: l._id,
    id: l._id,
    toolName: l.toolName,
    ownerName: "", // Would need to be mapped from counterpartyName
    borrowerName: "", // Would need to be mapped from counterpartyName
    startDate: l.startDate,
    endDate: l.endDate,
    status: l.status as UILoan["status"],
    returnedAt: l.returnedAt,
    counterpartyName: l.counterpartyName,
  };
}

export function adaptAdminLoan(l: {
  _id: string;
  toolName: string;
  ownerId: string;
  ownerName: string;
  borrowerId: string;
  borrowerName: string;
  startDate: string;
  endDate: string;
  status: string;
  returnedAt: number | null;
}): AdminLoanRecord {
  const isOverdue = l.status === "approved" && l.returnedAt === null;
  return {
    _id: l._id,
    id: l._id,
    toolName: l.toolName.toUpperCase(),
    category: "Unknown", // Would need tool category
    owner: l.ownerName,
    borrower: l.borrowerName === "[No Active Loan]" ? "[No Active Loan]" : l.borrowerName,
    dates: `${formatDate(l.startDate)} – ${formatDate(l.endDate)}`,
    status: isOverdue ? "late" : l.status as AdminLoanRecord["status"],
    statusDetail: isOverdue ? "Automated reminder sent 2 days ago" : "In good standing",
  };
}

function formatDate(d: string): string {
  const date = new Date(d);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
