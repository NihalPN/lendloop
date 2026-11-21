export type LoanStatus =
  | "pending"
  | "approved"
  | "declined"
  | "cancelled"
  | "returned";

export type LoanAction = "approve" | "decline" | "cancel" | "return";

/**
 * Checks whether a loan in `from` status can transition via `action`.
 * Pure state machine function per SPEC section 5.
 */
export function canTransition(from: LoanStatus, action: LoanAction): boolean {
  return getNextStatus(from, action) !== null;
}

/**
 * Returns the next status for a given transition, or null if invalid.
 */
export function getNextStatus(
  from: LoanStatus,
  action: LoanAction
): LoanStatus | null {
  if (from === "pending") {
    if (action === "approve") return "approved";
    if (action === "decline") return "declined";
    if (action === "cancel") return "cancelled";
  }
  if (from === "approved") {
    if (action === "return") return "returned";
  }
  return null;
}
