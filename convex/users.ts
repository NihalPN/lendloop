import { mutation, query, MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v, ConvexError } from "convex/values";
import { userRoleValidator } from "./lib/validators";
import { userProjection } from "./lib/projections";
import { Id } from "./_generated/dataModel";
import { requireActiveUser } from "./lib/auth";

/**
 * Ensures a user record exists in the users table for the authenticated caller.
 * Idempotent: calling multiple times returns the same record and creates only one row.
 * Seed applies only at initial creation and never updates an existing user.
 */
export const ensureUser = mutation({
  args: {},
  returns: v.object({
    _id: v.id("users"),
    email: v.string(),
    name: v.string(),
    role: userRoleValidator,
    trustedLender: v.boolean(),
  }),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        code: "UNAUTHENTICATED",
        message: "Authentication required",
      });
    }

    const rawEmail = identity.email;
    if (!rawEmail || typeof rawEmail !== "string" || rawEmail.trim() === "") {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Identity must include a valid email address",
      });
    }

    // Use tokenIdentifier, fall back to subject for test mocks
    const tokenIdentifier = identity.tokenIdentifier || identity.subject;

    // Check if user exists by tokenIdentifier
    const existing = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", tokenIdentifier))
      .unique();

    if (existing && existing.status !== "deleted") {
      if (existing.status === "suspended") {
        throw new ConvexError({
          code: "ACCOUNT_SUSPENDED",
          message: "This account has been suspended.",
        });
      }
      return userProjection(existing);
    }

    // Also check if an existing user with this email is suspended
    const existingByEmail = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", rawEmail.trim()))
      .first();

    if (existingByEmail && existingByEmail.status === "suspended") {
      throw new ConvexError({
        code: "ACCOUNT_SUSPENDED",
        message: "This account has been suspended.",
      });
    }

    const adminSeedEmail = process.env.ADMIN_SEED_EMAIL;
    const isSeedAdmin =
      identity.emailVerified === true &&
      adminSeedEmail !== undefined &&
      rawEmail.trim().toLowerCase() === adminSeedEmail.trim().toLowerCase();

    const role: "admin" | "user" = isSeedAdmin ? "admin" : "user";

    const rawName =
      identity.name && identity.name.trim() !== ""
        ? identity.name.trim()
        : rawEmail.split("@")[0] || "Anonymous";

    const name = rawName.slice(0, 100);

    const userId = await ctx.db.insert("users", {
      clerkId: identity.subject,
      tokenIdentifier,
      email: rawEmail.trim(),
      name,
      role,
      trustedLender: false,
      status: "active",
    });

    const user = await ctx.db.get(userId);
    if (!user) {
      throw new ConvexError({
        code: "INTERNAL_ERROR",
        message: "Failed to retrieve user record",
      });
    }

    return userProjection(user);
  },
});

/**
 * Store user info from Clerk after sign-in.
 * Called from the frontend AuthSync component after successful sign-in.
 * Uses the authenticated identity from Convex auth.
 * Creates user with role "user" by default; grants "admin" only if email matches ADMIN_SEED_EMAIL.
 */
export const storeUser = mutation({
  args: {},
  returns: v.union(
    v.object({
      _id: v.id("users"),
      email: v.string(),
      name: v.string(),
      role: userRoleValidator,
      trustedLender: v.boolean(),
    }),
    v.null()
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const rawEmail = identity.email;
    if (!rawEmail || typeof rawEmail !== "string" || rawEmail.trim() === "") {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Identity must include a valid email address",
      });
    }

    // Use tokenIdentifier, fall back to subject for test mocks
    const tokenIdentifier = identity.tokenIdentifier || identity.subject;

    // Check if user exists by tokenIdentifier
    const existing = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", tokenIdentifier))
      .unique();

    if (existing && existing.status !== "deleted") {
      if (existing.status === "suspended") {
        throw new ConvexError({
          code: "ACCOUNT_SUSPENDED",
          message: "This account has been suspended.",
        });
      }
      return userProjection(existing);
    }

    // Also check if an existing user with this email is suspended
    const existingByEmail = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", rawEmail.trim()))
      .first();

    if (existingByEmail && existingByEmail.status === "suspended") {
      throw new ConvexError({
        code: "ACCOUNT_SUSPENDED",
        message: "This account has been suspended.",
      });
    }

    // Determine role: matches ADMIN_SEED_EMAIL gets admin, everyone else gets user
    const adminSeedEmail = process.env.ADMIN_SEED_EMAIL;
    const isSeedAdmin =
      identity.emailVerified === true &&
      adminSeedEmail !== undefined &&
      rawEmail.trim().toLowerCase() === adminSeedEmail.trim().toLowerCase();

    const role: "admin" | "user" = isSeedAdmin ? "admin" : "user";

    const rawName =
      identity.name && identity.name.trim() !== ""
        ? identity.name.trim()
        : rawEmail.split("@")[0] || "Anonymous";

    const name = rawName.slice(0, 100);

    const userId = await ctx.db.insert("users", {
      clerkId: identity.subject,
      tokenIdentifier,
      email: rawEmail.trim(),
      name,
      role,
      trustedLender: false,
      status: "active",
    });

    const user = await ctx.db.get(userId);
    if (!user) {
      throw new ConvexError({
        code: "INTERNAL_ERROR",
        message: "Failed to retrieve user record",
      });
    }

    return userProjection(user);
  },
});

/**
 * Lightweight, non-throwing viewer query for SessionGuard and UI components.
 * Returns null if unauthenticated or row is missing.
 * Normalizes status to user.status ?? "active" so client guards can sign out
 * suspended/deleted accounts without crashing into an Error Boundary.
 */
export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const tokenIdentifier = identity.tokenIdentifier || identity.subject;
    const user = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", tokenIdentifier))
      .unique();
    if (!user) return null;
    return {
      ...user,
      status: user.status ?? "active",
    };
  },
});

/**
 * Get the current user's profile.
 * Alias for viewer query.
 */
export const getCurrentUser = viewer;

/**
 * Shared soft-delete helper used by both Admin deleteUser and user self-serve deleteMyAccount.
 * 1. Checks active/approved unreturned loans (as borrower or owner) -> throws CONFLICT.
 * 2. Auto-cancels pending loans (as borrower or owner).
 * 3. Hides/archives owned tools (status: "removed").
 * 4. Scrubs PII and mangles email, clerkId, and tokenIdentifier.
 * 5. Schedules Clerk IdP delete sync.
 */
export async function softDeleteUserAccount(
  ctx: MutationCtx,
  targetUserId: Id<"users">
): Promise<{ userId: Id<"users">; status: "deleted" }> {
  const user = await ctx.db.get(targetUserId);
  if (!user) {
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "User not found",
    });
  }

  if (user.status === "deleted") {
    throw new ConvexError({
      code: "INVALID_STATE",
      message: "User already deleted",
    });
  }

  // Active loan guard
  const borrowerApproved = await ctx.db
    .query("loans")
    .withIndex("by_borrower", (q) => q.eq("borrowerId", targetUserId))
    .collect();
  const hasActiveBorrowerLoan = borrowerApproved.some(
    (l) => l.status === "approved" && (l.returnedAt === undefined || l.returnedAt === null)
  );

  const ownerApproved = await ctx.db
    .query("loans")
    .withIndex("by_owner_status", (q) => q.eq("ownerId", targetUserId).eq("status", "approved"))
    .collect();
  const hasActiveOwnerLoan = ownerApproved.some(
    (l) => l.returnedAt === undefined || l.returnedAt === null
  );

  if (hasActiveBorrowerLoan || hasActiveOwnerLoan) {
    throw new ConvexError({
      code: "CONFLICT",
      message: "Resolve or return all active loans before deleting this account.",
    });
  }

  // Auto-cancel pending loans where user is borrower
  for (const loan of borrowerApproved) {
    if (loan.status === "pending") {
      await ctx.db.patch(loan._id, { status: "cancelled" });
    }
  }

  // Auto-cancel pending loans where user is owner
  const ownerPending = await ctx.db
    .query("loans")
    .withIndex("by_owner_status", (q) => q.eq("ownerId", targetUserId).eq("status", "pending"))
    .collect();
  for (const loan of ownerPending) {
    await ctx.db.patch(loan._id, { status: "cancelled" });
  }

  // Archive/hide all tools owned by user
  const userTools = await ctx.db
    .query("tools")
    .withIndex("by_owner_status", (q) => q.eq("ownerId", targetUserId))
    .collect();
  for (const tool of userTools) {
    if (tool.status !== "removed") {
      await ctx.db.patch(tool._id, { status: "removed" });
    }
  }

  const now = Date.now();
  const mangledEmail = `deleted_${user._id}_${now}@deleted.local`;
  const mangledClerkId = `deleted_${user._id}_${now}`;
  const mangledTokenIdentifier = `deleted_${user._id}_${now}`;

  await ctx.db.patch(targetUserId, {
    name: "Deleted User",
    email: mangledEmail,
    clerkId: mangledClerkId,
    tokenIdentifier: mangledTokenIdentifier,
    status: "deleted",
    deletedAt: now,
    trustedLender: false,
    tokenVersion: (user.tokenVersion ?? 0) + 1,
  });

  if (user.clerkId && internal.admin?.syncClerkUser) {
    await ctx.scheduler.runAfter(0, internal.admin.syncClerkUser, {
      clerkId: user.clerkId,
      action: "delete",
    });
  }

  return {
    userId: targetUserId,
    status: "deleted" as const,
  };
}

/**
 * Self-service account deletion for the authenticated user.
 * Guards active loans, auto-cancels pending requests, archives tools,
 * scrubs PII, mangles credentials/identifiers, and unlinks Clerk identity.
 */
export const deleteMyAccount = mutation({
  args: {},
  returns: v.object({
    userId: v.id("users"),
    status: v.literal("deleted"),
  }),
  handler: async (ctx) => {
    const caller = await requireActiveUser(ctx);
    return await softDeleteUserAccount(ctx, caller._id);
  },
});
