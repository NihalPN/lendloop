import { query, mutation, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v, ConvexError } from "convex/values";
import { requireAdmin } from "./lib/auth";
import { softDeleteUserAccount } from "./users";
import { loanStatusValidator, userRoleValidator } from "./lib/validators";

/**
 * Admin: list all loans (R30).
 * Returns loans newest first (default creation order), .take(200).
 * Fields: _id, toolName, ownerId, ownerName, borrowerId, borrowerName,
 * startDate, endDate, status, returnedAt (number|null).
 * No emails, no clerkId. Admin-only.
 */
export const listAllLoans = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("loans"),
      toolName: v.string(),
      ownerId: v.id("users"),
      ownerName: v.string(),
      borrowerId: v.id("users"),
      borrowerName: v.string(),
      startDate: v.string(),
      endDate: v.string(),
      status: loanStatusValidator,
      returnedAt: v.union(v.number(), v.null()),
    })
  ),
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const loans = await ctx.db
      .query("loans")
      .order("desc")
      .take(200);

    const results = [];
    for (const loan of loans) {
      const tool = await ctx.db.get(loan.toolId);
      const owner = await ctx.db.get(loan.ownerId);
      const borrower = await ctx.db.get(loan.borrowerId);

      results.push({
        _id: loan._id,
        toolName: tool?.name ?? "Unknown",
        ownerId: loan.ownerId,
        ownerName: owner?.name ?? "Unknown",
        borrowerId: loan.borrowerId,
        borrowerName: borrower?.name ?? "Unknown",
        startDate: loan.startDate,
        endDate: loan.endDate,
        status: loan.status,
        returnedAt: loan.returnedAt ?? null,
      });
    }
    return results;
  },
});

/**
 * Admin: get platform metrics (R30).
 * Returns aggregate counts for dashboard metrics.
 */
export const getPlatformMetrics = query({
  args: {},
  returns: v.object({
    totalUsers: v.number(),
    activeListings: v.number(),
    activeLoans: v.number(),
    overdueTools: v.number(),
    trustedNeighbors: v.number(),
  }),
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const [users, tools, loans] = await Promise.all([
      ctx.db.query("users").collect(),
      ctx.db.query("tools").withIndex("by_status_category", (q) => q.eq("status", "listed")).collect(),
      ctx.db.query("loans").withIndex("by_status_endDate", (q) => q.eq("status", "approved")).collect(),
    ]);

    const todayStr = new Date().toISOString().split("T")[0];
    let overdueCount = 0;
    for (const loan of loans) {
      if (loan.returnedAt === undefined || loan.returnedAt === null) {
        if (loan.endDate < todayStr) {
          overdueCount++;
        }
      }
    }

    const trustedCount = users.filter((u) => u.trustedLender).length;

    return {
      totalUsers: users.length,
      activeListings: tools.length,
      activeLoans: loans.length,
      overdueTools: overdueCount,
      trustedNeighbors: trustedCount,
    };
  },
});

/**
 * Admin: set trustedLender flag on a user (R31).
 * Requires admin. NOT_FOUND for unknown user.
 * Patches only trustedLender, returns { userId, trustedLender }.
 * Admin may set it on themselves.
 */
export const setTrustedLender = mutation({
  args: {
    userId: v.id("users"),
    trusted: v.boolean(),
  },
  returns: v.object({
    userId: v.id("users"),
    trustedLender: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }

    await ctx.db.patch(args.userId, { trustedLender: args.trusted });

    return {
      userId: args.userId,
      trustedLender: args.trusted,
    };
  },
});

/**
 * Admin: toggle user role between user and admin.
 * Requires admin. NOT_FOUND for unknown user.
 * - Prevents admin from demoting their own account (self-protection guard).
 * - Rejects changing role of suspended or deleted users.
 * - Patches user role in live users table.
 */
export const toggleUserRole = mutation({
  args: {
    userId: v.id("users"),
    role: v.union(v.literal("user"), v.literal("admin")),
  },
  returns: v.object({
    userId: v.id("users"),
    role: v.union(v.literal("user"), v.literal("admin")),
  }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    if (args.userId === admin._id && args.role !== "admin") {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Cannot demote your own account from admin",
      });
    }

    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }

    const targetStatus = user.status ?? "active";
    if (targetStatus !== "active") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "Cannot change role of a suspended or deleted user.",
      });
    }

    await ctx.db.patch(args.userId, { role: args.role });

    return {
      userId: args.userId,
      role: args.role,
    };
  },
});

export const setUserRole = toggleUserRole;
export const updateUserRole = toggleUserRole;

/**
 * Admin: list all users.
 */
export const listUsers = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("users"),
      clerkId: v.string(),
      tokenIdentifier: v.string(),
      email: v.string(),
      name: v.string(),
      role: userRoleValidator,
      trustedLender: v.boolean(),
      status: v.union(v.literal("active"), v.literal("suspended"), v.literal("deleted")),
      suspendedAt: v.optional(v.number()),
      deletedAt: v.optional(v.number()),
      tokenVersion: v.optional(v.number()),
    })
  ),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").collect();
    return users.map((u) => ({
      _id: u._id,
      clerkId: u.clerkId,
      tokenIdentifier: u.tokenIdentifier,
      email: u.email,
      name: u.name,
      role: u.role,
      trustedLender: u.trustedLender,
      status: (u.status ?? "active") as "active" | "suspended" | "deleted",
      suspendedAt: u.suspendedAt,
      deletedAt: u.deletedAt,
      tokenVersion: u.tokenVersion,
    }));
  },
});

/**
 * Internal action to sync account suspension, restoration, or deletion to Clerk IdP.
 * Safe no-op if CLERK_SECRET_KEY is not configured or in test environments.
 */
export const syncClerkUser = internalAction({
  args: {
    clerkId: v.string(),
    action: v.union(v.literal("ban"), v.literal("unban"), v.literal("delete")),
  },
  returns: v.null(),
  handler: async (_ctx, args) => {
    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey || !args.clerkId || args.clerkId.startsWith("deleted_")) {
      return null;
    }

    try {
      const headers = {
        Authorization: `Bearer ${clerkSecretKey}`,
        "Content-Type": "application/json",
      };

      if (args.action === "ban") {
        await fetch(`https://api.clerk.com/v1/users/${args.clerkId}/ban`, {
          method: "POST",
          headers,
        });
      } else if (args.action === "unban") {
        await fetch(`https://api.clerk.com/v1/users/${args.clerkId}/unban`, {
          method: "POST",
          headers,
        });
      } else if (args.action === "delete") {
        await fetch(`https://api.clerk.com/v1/users/${args.clerkId}`, {
          method: "DELETE",
          headers,
        });
      }
    } catch (err) {
      console.warn("Clerk IdP sync error (non-fatal):", err);
    }
    return null;
  },
});

/**
 * Admin: suspend a user (reversible ban).
 * - Blocks login and re-registration.
 * - Does NOT mangle email or delete accounts.
 * - Hides all listed tools owned by user.
 * - Cancels all pending loans involving user as borrower or owner.
 * - Increments tokenVersion and triggers Clerk ban.
 * - Admin cannot suspend themselves.
 */
export const suspendUser = mutation({
  args: {
    userId: v.id("users"),
  },
  returns: v.object({
    userId: v.id("users"),
    status: v.literal("suspended"),
  }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    if (args.userId === admin._id) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Cannot suspend your own account",
      });
    }

    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }

    if (user.status === "deleted") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "Cannot suspend a deleted user",
      });
    }

    await ctx.db.patch(args.userId, {
      status: "suspended",
      suspendedAt: Date.now(),
      tokenVersion: (user.tokenVersion ?? 0) + 1,
    });

    // Hide/archive listed tools owned by user
    const userTools = await ctx.db
      .query("tools")
      .withIndex("by_owner_status", (q) => q.eq("ownerId", args.userId).eq("status", "listed"))
      .collect();
    for (const tool of userTools) {
      await ctx.db.patch(tool._id, { status: "removed" });
    }

    // Cancel pending loans where user is borrower
    const borrowerLoans = await ctx.db
      .query("loans")
      .withIndex("by_borrower", (q) => q.eq("borrowerId", args.userId))
      .collect();
    for (const loan of borrowerLoans) {
      if (loan.status === "pending") {
        await ctx.db.patch(loan._id, { status: "cancelled" });
      }
    }

    // Cancel pending loans where user is owner
    const ownerLoans = await ctx.db
      .query("loans")
      .withIndex("by_owner_status", (q) => q.eq("ownerId", args.userId).eq("status", "pending"))
      .collect();
    for (const loan of ownerLoans) {
      await ctx.db.patch(loan._id, { status: "cancelled" });
    }

    if (user.clerkId && internal.admin?.syncClerkUser) {
      await ctx.scheduler.runAfter(0, internal.admin.syncClerkUser, {
        clerkId: user.clerkId,
        action: "ban",
      });
    }

    return {
      userId: args.userId,
      status: "suspended" as const,
    };
  },
});

/**
 * Admin: restore a suspended user.
 * - Only allowed when user is suspended (never deleted or active).
 * - Restores status: "active", clears suspendedAt, increments tokenVersion.
 * - Admin cannot restore themselves (guard applies).
 */
export const unsuspendUser = mutation({
  args: {
    userId: v.id("users"),
  },
  returns: v.object({
    userId: v.id("users"),
    status: v.literal("active"),
  }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    if (args.userId === admin._id) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Cannot perform this action on your own account",
      });
    }

    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }

    if ((user.status ?? "active") !== "suspended") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "User is not suspended",
      });
    }

    await ctx.db.patch(args.userId, {
      status: "active",
      suspendedAt: undefined,
      tokenVersion: (user.tokenVersion ?? 0) + 1,
    });

    if (user.clerkId && internal.admin?.syncClerkUser) {
      await ctx.scheduler.runAfter(0, internal.admin.syncClerkUser, {
        clerkId: user.clerkId,
        action: "unban",
      });
    }

    return {
      userId: args.userId,
      status: "active" as const,
    };
  },
});

export const restoreUser = unsuspendUser;

/**
 * Admin: soft-delete user (anonymize PII and free email for re-registration).
 * - Checks active loans (cannot delete user with active/approved loans as borrower or owner).
 * - Auto-cancels all pending loans involving user.
 * - Archives/hides all tools owned by user.
 * - Mangles email, clerkId, tokenIdentifier, sets name to "Deleted User", status: "deleted".
 * - Schedules Clerk delete.
 * - Admin cannot delete themselves.
 */
export const deleteUser = mutation({
  args: {
    userId: v.id("users"),
  },
  returns: v.object({
    userId: v.id("users"),
    status: v.literal("deleted"),
  }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    if (args.userId === admin._id) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Cannot delete your own account",
      });
    }

    return await softDeleteUserAccount(ctx, args.userId);
  },
});
