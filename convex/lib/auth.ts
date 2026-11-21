import { QueryCtx, MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { ConvexError } from "convex/values";

/**
 * Helper to get authenticated user identity or throw.
 */
export async function getCaller(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users">> {
  return await requireActiveUser(ctx);
}

/**
 * Helper to get authenticated user identity and assert active account status.
 * Rejects immediately with ConvexError if user is suspended or deleted.
 */
export async function requireActiveUser(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError({
      code: "UNAUTHENTICATED",
      message: "Authentication required",
    });
  }

  // Use tokenIdentifier, fall back to subject for test mocks
  const tokenIdentifier = identity.tokenIdentifier || identity.subject;

  const user = await ctx.db
    .query("users")
    .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", tokenIdentifier))
    .unique();

  if (!user) {
    throw new ConvexError({
      code: "UNAUTHENTICATED",
      message: "User not found in database",
    });
  }

  const status = user.status ?? "active";
  if (status === "suspended") {
    throw new ConvexError({
      code: "ACCOUNT_SUSPENDED",
      message: "This account has been suspended",
    });
  }
  if (status === "deleted") {
    throw new ConvexError({
      code: "ACCOUNT_DELETED",
      message: "This account has been deleted",
    });
  }

  return user;
}

/**
 * Derives and returns the authenticated user document from ctx.auth.
 * Throws UNAUTHENTICATED if the caller has no valid session or has no users table record.
 */
export async function requireUser(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users">> {
  return await requireActiveUser(ctx);
}

/**
 * Ensures the caller is authenticated and has the admin role.
 * Throws FORBIDDEN if the caller is not an admin.
 */
export async function requireAdmin(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (user.role !== "admin") {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "Admin role required",
    });
  }
  return user;
}

/**
 * Ensures the caller is authenticated and is the exact owner of the resource.
 * Has NO admin bypass (admins must not pass owner-only checks).
 */
export async function requireOwner(
  ctx: QueryCtx | MutationCtx,
  ownerId: Id<"users">
): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (user._id !== ownerId) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "Resource ownership required",
    });
  }
  return user;
}

/**
 * Only for tool removal and loan reads (R5, R18). For owner-only actions use requireOwner.
 */
export async function requireOwnerOrAdmin(
  ctx: QueryCtx | MutationCtx,
  ownerId: Id<"users">
): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (user._id !== ownerId && user.role !== "admin") {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "Access forbidden",
    });
  }
  return user;
}

/**
 * Ensures caller is authenticated, fetches the loan by loanId, and asserts
 * that the caller is either the borrower or the owner of the loan.
 * Throws UNAUTHENTICATED if unauthenticated.
 * Throws NOT_FOUND if the loan does not exist or caller is neither borrower nor owner (R18, R19, R28).
 */
export async function getParticipantLoan(
  ctx: QueryCtx | MutationCtx,
  loanId: Id<"loans">
): Promise<{ caller: Doc<"users">; loan: Doc<"loans"> }> {
  const caller = await requireUser(ctx);
  const loan = await ctx.db.get(loanId);
  if (
    !loan ||
    (loan.borrowerId !== caller._id && loan.ownerId !== caller._id)
  ) {
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "Loan not found",
    });
  }
  return { caller, loan };
}
