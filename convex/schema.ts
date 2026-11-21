import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  userRoleValidator,
  toolCategoryValidator,
  toolConditionValidator,
  toolStatusValidator,
  loanStatusValidator,
  automationEventTypeValidator,
  automationEventStatusValidator,
} from "./lib/validators";

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    tokenIdentifier: v.string(),
    email: v.string(),
    name: v.string(),
    role: userRoleValidator,
    trustedLender: v.boolean(),
    status: v.optional(v.union(v.literal("active"), v.literal("suspended"), v.literal("deleted"))),
    suspendedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
    tokenVersion: v.optional(v.number()),
  })
    .index("by_clerkId", ["clerkId"])
    .index("by_tokenIdentifier", ["tokenIdentifier"])
    .index("by_email", ["email"]),

  tools: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    category: toolCategoryValidator,
    condition: toolConditionValidator,
    description: v.string(),
    status: toolStatusValidator,
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_status", ["ownerId", "status"])
    .index("by_status_category", ["status", "category"]),

  loans: defineTable({
    toolId: v.id("tools"),
    borrowerId: v.id("users"),
    ownerId: v.id("users"),
    startDate: v.string(),
    endDate: v.string(),
    decidedAt: v.optional(v.number()),
    status: loanStatusValidator,
    returnedAt: v.optional(v.number()),
    lastReminderSentAt: v.optional(v.number()),
  })
    .index("by_tool", ["toolId"])
    .index("by_borrower", ["borrowerId"])
    .index("by_owner", ["ownerId"])
    .index("by_owner_status", ["ownerId", "status"])
    .index("by_status_endDate", ["status", "endDate"]),

  automationEvents: defineTable({
    loanId: v.id("loans"),
    type: automationEventTypeValidator,
    idempotencyKey: v.string(),
    status: automationEventStatusValidator,
    attempts: v.number(),
    lastError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_loan", ["loanId"])
    .index("by_idempotencyKey", ["idempotencyKey"])
    .index("by_status", ["status"]),
});
