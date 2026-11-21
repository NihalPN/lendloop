import { mutation, query, internalQuery, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v, ConvexError } from "convex/values";
import {
  loanStatusValidator,
  validateLoanDates,
} from "./lib/validators";
import {
  loanProjection,
  loanProjectionValidator,
} from "./lib/projections";
import { canTransition } from "./lib/loanStateMachine";
import { getParticipantLoan, getCaller } from "./lib/auth";
import { today } from "./lib/dates";

/**
 * Creates a new loan request (R10, R11, R12, R26).
 * Enforces order:
 * requireUser -> tool fetch (NOT_FOUND) -> own tool (FORBIDDEN) -> dates validation (INVALID_INPUT) -> pending duplicate check (CONFLICT).
 */
export const request = mutation({
  args: {
    toolId: v.id("tools"),
    startDate: v.string(),
    endDate: v.string(),
  },
  returns: loanProjectionValidator,
  handler: async (ctx, args) => {
    const caller = await getCaller(ctx);

    // Enforce 15/hour per-user rate limit on loan requests using by_borrower index
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const recentRequests = await ctx.db
      .query("loans")
      .withIndex("by_borrower", (q) => q.eq("borrowerId", caller._id))
      .filter((q) => q.gte(q.field("_creationTime"), oneHourAgo))
      .collect();

    if (recentRequests.length >= 15) {
      throw new ConvexError({
        code: "RATE_LIMITED",
        message: "Loan request rate limit exceeded (maximum 15 requests per hour).",
      });
    }

    const tool = await ctx.db.get(args.toolId);
    if (!tool || tool.status === "removed") {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Tool not found",
      });
    }

    if (tool.ownerId === caller._id) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Cannot borrow your own tool",
      });
    }

    validateLoanDates({
      startDate: args.startDate,
      endDate: args.endDate,
      todayStr: today(),
    });

    // R26: a borrower can have only one pending request per tool at a time
    const existingLoans = await ctx.db
      .query("loans")
      .withIndex("by_tool", (q) => q.eq("toolId", tool._id))
      .collect();

    for (const loan of existingLoans) {
      if (loan.borrowerId === caller._id && loan.status === "pending") {
        throw new ConvexError({
          code: "CONFLICT",
          message: "You already have a pending request for this tool",
        });
      }
    }

    const loanId = await ctx.db.insert("loans", {
      toolId: tool._id,
      borrowerId: caller._id,
      ownerId: tool.ownerId,
      startDate: args.startDate,
      endDate: args.endDate,
      status: "pending",
    });

    const owner = await ctx.db.get(tool.ownerId);
    if (!owner) {
      throw new ConvexError({
        code: "INTERNAL_ERROR",
        message: "Tool owner not found",
      });
    }

    // Emit outbox event for loan.requested (skip in test if internal not available)
    const internalAutomation = internal.automation;
    if (internalAutomation?.insertOutboxEvent) {
      const eventId = await ctx.runMutation(internal.automation.insertOutboxEvent, {
        loanId,
        type: "loan.requested",
        idempotencyKey: `evt_${loanId}_requested`,
      });
      await ctx.scheduler.runAfter(0, internal.automation.deliver, { eventId });
    }

    return {
      _id: loanId,
      toolName: tool.name,
      startDate: args.startDate,
      endDate: args.endDate,
      status: "pending" as const,
      returnedAt: null,
      counterpartyName: owner.name,
    };
  },
});

/**
 * Approves a pending loan (R13, R16, R17, R27, R28).
 * Enforces R28 order:
 * requireUser -> fetch loan (NOT_FOUND) -> role check (FORBIDDEN) -> transition check (INVALID_TRANSITION) -> action checks:
 * tool listed (CONFLICT) -> expired (INVALID_INPUT) -> overlap check (CONFLICT_OVERLAP).
 */
export const approve = mutation({
  args: {
    loanId: v.id("loans"),
  },
  returns: loanProjectionValidator,
  handler: async (ctx, args) => {
    const { caller, loan } = await getParticipantLoan(ctx, args.loanId);

    if (caller._id !== loan.ownerId) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Only the tool owner can approve a loan",
      });
    }

    if (!canTransition(loan.status, "approve")) {
      throw new ConvexError({
        code: "INVALID_TRANSITION",
        message: `Cannot approve loan in status ${loan.status}`,
      });
    }

    const tool = await ctx.db.get(loan.toolId);
    if (!tool || tool.status !== "listed") {
      throw new ConvexError({
        code: "CONFLICT",
        message: "Tool is no longer listed",
      });
    }

    if (loan.endDate < today()) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Loan request has expired",
      });
    }

    // R17: Overlap check across all approved unreturned loans for this tool
    const toolLoans = await ctx.db
      .query("loans")
      .withIndex("by_tool", (q) => q.eq("toolId", loan.toolId))
      .collect();

    for (const other of toolLoans) {
      if (
        other._id !== loan._id &&
        other.status === "approved" &&
        other.returnedAt === undefined
      ) {
        if (other.startDate <= loan.endDate && other.endDate >= loan.startDate) {
          throw new ConvexError({
            code: "CONFLICT_OVERLAP",
            message: "Tool is already booked for overlapping dates.",
          });
        }
      }
    }

    const now = Date.now();
    await ctx.db.patch(loan._id, {
      status: "approved",
      decidedAt: now,
    });

    const borrower = await ctx.db.get(loan.borrowerId);
    if (!borrower) {
      throw new ConvexError({
        code: "INTERNAL_ERROR",
        message: "Borrower not found",
      });
    }

    const internalAutomation = internal.automation;
    if (internalAutomation?.insertOutboxEvent) {
      const eventId = await ctx.runMutation(internal.automation.insertOutboxEvent, {
        loanId: loan._id,
        type: "loan.approved",
        idempotencyKey: `evt_${loan._id}_approved`,
      });
      await ctx.scheduler.runAfter(0, internal.automation.deliver, { eventId });
    }

    return {
      _id: loan._id,
      toolName: tool.name,
      startDate: loan.startDate,
      endDate: loan.endDate,
      decidedAt: now,
      status: "approved" as const,
      returnedAt: null,
      counterpartyName: borrower.name,
    };
  },
});

/**
 * Declines a pending loan (R13, R16, R28).
 * Enforces R28 order:
 * requireUser -> fetch loan (NOT_FOUND) -> role check (FORBIDDEN) -> transition check (INVALID_TRANSITION).
 */
export const decline = mutation({
  args: {
    loanId: v.id("loans"),
  },
  returns: loanProjectionValidator,
  handler: async (ctx, args) => {
    const { caller, loan } = await getParticipantLoan(ctx, args.loanId);

    if (caller._id !== loan.ownerId) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Only the tool owner can decline a loan",
      });
    }

    if (!canTransition(loan.status, "decline")) {
      throw new ConvexError({
        code: "INVALID_TRANSITION",
        message: `Cannot decline loan in status ${loan.status}`,
      });
    }

    await ctx.db.patch(loan._id, {
      status: "declined",
      decidedAt: Date.now(),
    });

    const tool = await ctx.db.get(loan.toolId);
    const borrower = await ctx.db.get(loan.borrowerId);

    const internalAutomation = internal.automation;
    if (internalAutomation?.insertOutboxEvent) {
      const eventId = await ctx.runMutation(internal.automation.insertOutboxEvent, {
        loanId: loan._id,
        type: "loan.declined",
        idempotencyKey: `evt_${loan._id}_declined`,
      });
      await ctx.scheduler.runAfter(0, internal.automation.deliver, { eventId });
    }

    return loanProjection(
      { ...loan, status: "declined" },
      tool ? tool.name : "Unknown",
      borrower ? borrower.name : "Unknown"
    );
  },
});

/**
 * Cancels a pending loan (R14, R16, R28).
 * Enforces R28 order:
 * requireUser -> fetch loan (NOT_FOUND) -> role check (FORBIDDEN) -> transition check (INVALID_TRANSITION).
 */
export const cancel = mutation({
  args: {
    loanId: v.id("loans"),
  },
  returns: loanProjectionValidator,
  handler: async (ctx, args) => {
    const { caller, loan } = await getParticipantLoan(ctx, args.loanId);

    if (caller._id !== loan.borrowerId) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Only the borrower can cancel a loan",
      });
    }

    if (!canTransition(loan.status, "cancel")) {
      throw new ConvexError({
        code: "INVALID_TRANSITION",
        message: `Cannot cancel loan in status ${loan.status}`,
      });
    }

    await ctx.db.patch(loan._id, { status: "cancelled" });

    const tool = await ctx.db.get(loan.toolId);
    const owner = await ctx.db.get(loan.ownerId);

    const internalAutomation = internal.automation;
    if (internalAutomation?.insertOutboxEvent) {
      const eventId = await ctx.runMutation(internal.automation.insertOutboxEvent, {
        loanId: loan._id,
        type: "loan.cancelled",
        idempotencyKey: `evt_${loan._id}_cancelled`,
      });
      await ctx.scheduler.runAfter(0, internal.automation.deliver, { eventId });
    }

    return loanProjection(
      { ...loan, status: "cancelled" },
      tool ? tool.name : "Unknown",
      owner ? owner.name : "Unknown"
    );
  },
});

/**
 * Marks an approved loan as returned (R15, R16, R28).
 * Enforces R28 order:
 * requireUser -> fetch loan (NOT_FOUND) -> role check (FORBIDDEN) -> transition check (INVALID_TRANSITION).
 */
export const markReturned = mutation({
  args: {
    loanId: v.id("loans"),
  },
  returns: loanProjectionValidator,
  handler: async (ctx, args) => {
    const { caller, loan } = await getParticipantLoan(ctx, args.loanId);

    if (caller._id !== loan.ownerId) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Only the tool owner can mark a loan as returned",
      });
    }

    if (!canTransition(loan.status, "return")) {
      throw new ConvexError({
        code: "INVALID_TRANSITION",
        message: `Cannot mark returned loan in status ${loan.status}`,
      });
    }

    const returnedAt = Date.now();
    await ctx.db.patch(loan._id, { status: "returned", returnedAt });

    const tool = await ctx.db.get(loan.toolId);
    const borrower = await ctx.db.get(loan.borrowerId);

    const internalAutomation = internal.automation;
    if (internalAutomation?.insertOutboxEvent) {
      const eventId = await ctx.runMutation(internal.automation.insertOutboxEvent, {
        loanId: loan._id,
        type: "loan.returned",
        idempotencyKey: `evt_${loan._id}_returned`,
      });
      await ctx.scheduler.runAfter(0, internal.automation.deliver, { eventId });
    }

    return loanProjection(
      { ...loan, status: "returned", returnedAt },
      tool ? tool.name : "Unknown",
      borrower ? borrower.name : "Unknown"
    );
  },
});

/**
 * Returns the caller's borrowed loans (R18, R29).
 * Sorted newest first, capped at 200 items.
 */
export const listMine = query({
  args: {},
  returns: v.array(loanProjectionValidator),
  handler: async (ctx) => {
    const caller = await getCaller(ctx);

    // TODO: Implement pagination when borrowed loans exceed 200 items
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_borrower", (q) => q.eq("borrowerId", caller._id))
      .order("desc")
      .take(200);

    const results = [];
    for (const loan of loans) {
      const tool = await ctx.db.get(loan.toolId);
      const owner = await ctx.db.get(loan.ownerId);
      results.push(
        loanProjection(
          loan,
          tool ? tool.name : "Unknown",
          owner ? owner.name : "Unknown"
        )
      );
    }
    return results;
  },
});

/**
 * Internal query to get all overdue loans.
 * Overdue = status = "approved", returnedAt is unset, and endDate < today.
 * Only returns loans where lastReminderSentAt is undefined or older than 24 hours.
 * Returns array of { loanId, borrowerEmail, toolName, dueDate }.
 */
export const getOverdue = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      loanId: v.id("loans"),
      borrowerEmail: v.string(),
      toolName: v.string(),
      dueDate: v.string(),
    })
  ),
  handler: async (ctx) => {
    const todayStr = today();
    const now = Date.now();
    const twentyFourHoursAgo = now - 86_400_000;

    // Find all approved loans
    const approvedLoans = await ctx.db
      .query("loans")
      .withIndex("by_status_endDate", (q) => q.eq("status", "approved"))
      .collect();

    const results = [];
    for (const loan of approvedLoans) {
      // Skip if returnedAt is set (already returned)
      if (loan.returnedAt !== undefined && loan.returnedAt !== null) {
        continue;
      }

      // Overdue = status = "approved", returnedAt is unset, and endDate < today
      if (loan.endDate >= todayStr) {
        continue;
      }

      // Skip if lastReminderSentAt is set and less than 24 hours ago
      if (
        loan.lastReminderSentAt !== undefined &&
        loan.lastReminderSentAt !== null &&
        loan.lastReminderSentAt > twentyFourHoursAgo
      ) {
        continue;
      }

      const [tool, borrower] = await Promise.all([
        ctx.db.get(loan.toolId),
        ctx.db.get(loan.borrowerId),
      ]);

      if (!tool || !borrower) {
        continue;
      }

      results.push({
        loanId: loan._id,
        borrowerEmail: borrower.email,
        toolName: tool.name,
        dueDate: loan.endDate,
      });
    }

    return results;
  },
});

/**
 * Internal mutation to mark a reminder as sent for a loan.
 * Updates lastReminderSentAt to the current timestamp.
 */
export const markReminderSent = internalMutation({
  args: { loanId: v.id("loans") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const loan = await ctx.db.get(args.loanId);
    if (!loan) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Loan not found",
      });
    }

    await ctx.db.patch(args.loanId, {
      lastReminderSentAt: Date.now(),
    });

    return null;
  },
});

/**
 * Returns incoming requests/loans for tools owned by the caller (R18, R29).
 * Sorted newest first, capped at 200 items, optional status filter.
 */
export const listIncoming = query({
  args: {
    status: v.optional(loanStatusValidator),
  },
  returns: v.array(loanProjectionValidator),
  handler: async (ctx, args) => {
    const caller = await getCaller(ctx);

    // TODO: Implement pagination when incoming loans exceed 200 items
    const status = args.status;
    const loans =
      status !== undefined
        ? await ctx.db
            .query("loans")
            .withIndex("by_owner_status", (q) =>
              q.eq("ownerId", caller._id).eq("status", status)
            )
            .order("desc")
            .take(200)
        : await ctx.db
            .query("loans")
            .withIndex("by_owner", (q) =>
              q.eq("ownerId", caller._id)
            )
            .order("desc")
            .take(200);

    const results = [];
    for (const loan of loans) {
      const tool = await ctx.db.get(loan.toolId);
      const borrower = await ctx.db.get(loan.borrowerId);
      results.push(
        loanProjection(
          loan,
          tool ? tool.name : "Unknown",
          borrower ? borrower.name : "Unknown"
        )
      );
    }
    return results;
  },
});

// Semantic function aliases
export const requestLoan = request;
export const createLoan = request;
export const approveLoan = approve;
export const declineLoan = decline;
export const rejectLoan = decline;
