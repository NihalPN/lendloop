import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { Id } from "./_generated/dataModel";
import {
  toolCategoryValidator,
  toolConditionValidator,
  validateToolFields,
} from "./lib/validators";
import {
  toolProjection,
  toolProjectionValidator,
  publicToolProjection,
  publicToolProjectionValidator,
} from "./lib/projections";
import { requireUser, requireOwner, requireOwnerOrAdmin, requireActiveUser } from "./lib/auth";
import { today } from "./lib/dates";

/**
 * Derives tool availability per SPEC section 2:
 * A tool is available if it has no approved loan with returnedAt unset and startDate <= today.
 */
async function isToolAvailable(
  ctx: QueryCtx | MutationCtx,
  toolId: Id<"tools">,
  todayStr: string
): Promise<boolean> {
  const activeLoan = await ctx.db
    .query("loans")
    .withIndex("by_tool", (q) => q.eq("toolId", toolId))
    .filter((q) =>
      q.and(
        q.eq(q.field("status"), "approved"),
        q.eq(q.field("returnedAt"), undefined),
        q.lte(q.field("startDate"), todayStr)
      )
    )
    .first();

  return activeLoan === null;
}

/**
 * Helper to get authenticated user identity or throw.
 */
async function getAuthenticatedUser(ctx: QueryCtx | MutationCtx) {
  return await requireActiveUser(ctx);
}

/**
 * Creates a new tool listing. Owner is always derived from the caller (R4).
 */
export const create = mutation({
  args: {
    name: v.string(),
    category: toolCategoryValidator,
    condition: toolConditionValidator,
    description: v.string(),
  },
  returns: toolProjectionValidator,
  handler: async (ctx, args) => {
    const caller = await getAuthenticatedUser(ctx);

    // Enforce 15/hour per-user rate limit on tool creation using by_owner index
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const recentTools = await ctx.db
      .query("tools")
      .withIndex("by_owner", (q) => q.eq("ownerId", caller._id))
      .filter((q) => q.gte(q.field("_creationTime"), oneHourAgo))
      .collect();

    if (recentTools.length >= 15) {
      throw new ConvexError({
        code: "RATE_LIMITED",
        message: "Tool creation rate limit exceeded (maximum 15 tools per hour).",
      });
    }

    const validated = validateToolFields({
      name: args.name,
      description: args.description,
    });

    const toolId = await ctx.db.insert("tools", {
      ownerId: caller._id,
      name: validated.name,
      category: args.category,
      condition: args.condition,
      description: validated.description,
      status: "listed",
    });

    const tool = await ctx.db.get(toolId);
    if (!tool) {
      throw new ConvexError({
        code: "INTERNAL_ERROR",
        message: "Failed to retrieve created tool",
      });
    }
    return toolProjection(
      tool,
      true,
      true,
      caller.trustedLender,
      caller.name,
      "0.1 mi"
    );
  },
});

/**
 * Updates an existing tool listing (R5).
 * Enforces: requireUser -> fetch -> NOT_FOUND -> requireOwner -> validateToolFields -> patch.
 */
export const update = mutation({
  args: {
    toolId: v.id("tools"),
    name: v.string(),
    category: toolCategoryValidator,
    condition: toolConditionValidator,
    description: v.string(),
  },
  returns: toolProjectionValidator,
  handler: async (ctx, args) => {
    const caller = await getAuthenticatedUser(ctx);
    const tool = await ctx.db.get(args.toolId);
    if (!tool || tool.status === "removed") {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Tool not found",
      });
    }

    if (tool.ownerId !== caller._id) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Not the tool owner",
      });
    }

    const validated = validateToolFields({
      name: args.name,
      description: args.description,
    });

    await ctx.db.patch(tool._id, {
      name: validated.name,
      category: args.category,
      condition: args.condition,
      description: validated.description,
    });

    const updated = await ctx.db.get(tool._id);
    if (!updated) {
      throw new ConvexError({
        code: "INTERNAL_ERROR",
        message: "Failed to load updated tool",
      });
    }

    const available = await isToolAvailable(ctx, updated._id, today());
    return toolProjection(updated, available, true, caller.trustedLender, caller.name, "0.1 mi");
  },
});

/**
 * Removes a tool listing (R5, R9).
 * Enforces: requireUser -> fetch -> NOT_FOUND -> requireOwnerOrAdmin -> loan scan -> CONFLICT if active loan.
 */
export const remove = mutation({
  args: {
    toolId: v.id("tools"),
  },
  returns: v.object({
    success: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const caller = await getAuthenticatedUser(ctx);
    const tool = await ctx.db.get(args.toolId);
    if (!tool || tool.status === "removed") {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Tool not found",
      });
    }

    if (tool.ownerId !== caller._id && caller.role !== "admin") {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Not the tool owner or admin",
      });
    }

    const toolLoans = await ctx.db
      .query("loans")
      .withIndex("by_tool", (q) => q.eq("toolId", tool._id))
      .collect();

    for (const loan of toolLoans) {
      if (
        loan.status === "approved" &&
        loan.returnedAt === undefined
      ) {
        throw new ConvexError({
          code: "CONFLICT",
          message: "Cannot remove tool with an active or overdue loan",
        });
      }
    }

    // TODO(R9): Cancel pending loans once automationEvents outbox is implemented
    await ctx.db.patch(tool._id, { status: "removed" });

    return { success: true };
  },
});

/**
 * Public tools listing (R6).
 * Needs no authentication, returns only { name, category, available }.
 */
export const listPublic = query({
  args: {},
  returns: v.array(publicToolProjectionValidator),
  handler: async (ctx) => {
    // TODO: Implement pagination when tools collection exceeds 200 items
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_status_category", (q) => q.eq("status", "listed"))
      .take(200);

    const todayStr = today();
    return await Promise.all(
      tools.map(async (tool) => {
        const available = await isToolAvailable(ctx, tool._id, todayStr);
        return publicToolProjection(tool, available);
      })
    );
  },
});

/**
 * Authenticated tools listing (R8).
 * Supports optional category filter, calculates isMine and available, never returns owner email.
 */
export const listAll = query({
  args: {
    category: v.optional(toolCategoryValidator),
  },
  returns: v.array(toolProjectionValidator),
  handler: async (ctx, args) => {
    const caller = await getAuthenticatedUser(ctx);
    // TODO: Implement pagination when tools collection exceeds 200 items
    const todayStr = today();

    const category = args.category;
    const tools =
      category !== undefined
        ? await ctx.db
            .query("tools")
            .withIndex("by_status_category", (q) =>
              q.eq("status", "listed").eq("category", category)
            )
            .take(200)
        : await ctx.db
            .query("tools")
            .withIndex("by_status_category", (q) => q.eq("status", "listed"))
            .take(200);

    return await Promise.all(
      tools.map(async (tool) => {
        const available = await isToolAvailable(ctx, tool._id, todayStr);
        const isMine = tool.ownerId === caller._id;
        const owner = await ctx.db.get(tool.ownerId);
        const ownerTrusted = owner?.trustedLender ?? false;
        const ownerName = owner?.name ?? "Neighbor";
        return toolProjection(tool, available, isMine, ownerTrusted, ownerName, "0.1 mi");
      })
    );
  },
});

/**
 * Authenticated list of caller's tools.
 */
export const listMine = query({
  args: {},
  returns: v.array(toolProjectionValidator),
  handler: async (ctx) => {
    const caller = await getAuthenticatedUser(ctx);
    // TODO: Implement pagination when tools collection exceeds 200 items
    const todayStr = today();

    const tools = await ctx.db
      .query("tools")
      .withIndex("by_owner_status", (q) =>
        q.eq("ownerId", caller._id).eq("status", "listed")
      )
      .take(200);

    return await Promise.all(
      tools.map(async (tool) => {
        const available = await isToolAvailable(ctx, tool._id, todayStr);
        return toolProjection(tool, available, true, caller.trustedLender, caller.name, "0.1 mi");
      })
    );
  },
});

/**
 * Get a single tool by ID.
 * Returns the tool with availability, owner info, and distance.
 * Safely normalizes toolId string so invalid/malformed IDs return null instead of throwing.
 */
export const get = query({
  args: { toolId: v.string() },
  returns: v.union(toolProjectionValidator, v.null()),
  handler: async (ctx, args) => {
    const normalizedId = ctx.db.normalizeId("tools", args.toolId);
    if (!normalizedId) {
      return null;
    }
    const tool = await ctx.db.get(normalizedId);
    if (!tool || tool.status === "removed") {
      return null;
    }

    const todayStr = today();
    const available = await isToolAvailable(ctx, tool._id, todayStr);
    
    // For public view, we don't have a caller, so use defaults
    const owner = await ctx.db.get(tool.ownerId);
    const ownerName = owner?.name ?? "Neighbor";
    const ownerTrusted = owner?.trustedLender ?? false;
    
    return toolProjection(tool, available, false, ownerTrusted, ownerName, "0.1 mi");
  },
});
