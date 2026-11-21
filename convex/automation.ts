import { internalMutation, internalQuery, internalAction } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { signPayload } from "./lib/hmac";
import { internal } from "./_generated/api";

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;
const N8N_WEBHOOK_SECRET = process.env.N8N_WEBHOOK_SECRET;

/**
 * Internal mutation to insert an outbox event with deduplication via idempotencyKey.
 * Returns the event ID (existing or newly created).
 */
export const insertOutboxEvent = internalMutation({
  args: {
    loanId: v.id("loans"),
    type: v.union(
      v.literal("loan.requested"),
      v.literal("loan.approved"),
      v.literal("loan.declined"),
      v.literal("loan.cancelled"),
      v.literal("loan.returned"),
      v.literal("overdue_reminder")
    ),
    idempotencyKey: v.string(),
  },
  returns: v.id("automationEvents"),
  handler: async (ctx, args) => {
    // Check for existing event with same idempotencyKey
    const existing = await ctx.db
      .query("automationEvents")
      .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .first();

    if (existing) {
      return existing._id;
    }

    const now = Date.now();
    const eventId = await ctx.db.insert("automationEvents", {
      loanId: args.loanId,
      type: args.type,
      idempotencyKey: args.idempotencyKey,
      status: "queued",
      attempts: 0,
      lastError: undefined,
      createdAt: now,
      updatedAt: now,
    });

    return eventId;
  },
});

/**
 * Internal mutation to mark an event as failed, incrementing attempts and storing error.
 */
export const markEventFailed = internalMutation({
  args: {
    eventId: v.id("automationEvents"),
    error: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Event not found",
      });
    }

    // Only increment attempts if not already sent
    if (event.status === "sent") {
      return null;
    }

    const attempts = event.attempts + 1;
    const status = attempts >= 5 ? "failed" : "queued";

    await ctx.db.patch(args.eventId, {
      status,
      attempts,
      lastError: args.error.slice(0, 500),
      updatedAt: Date.now(),
    });

    return null;
  },
});

/**
 * Internal mutation to mark an event as sent.
 */
export const markEventSent = internalMutation({
  args: {
    eventId: v.id("automationEvents"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Event not found",
      });
    }

    // Only update if not already sent
    if (event.status === "sent") {
      return null;
    }

    await ctx.db.patch(args.eventId, {
      status: "sent",
      updatedAt: Date.now(),
    });

    return null;
  },
});

/**
 * Internal mutation to record an overdue reminder event.
 * Idempotent: if a row with the same idempotencyKey exists, returns success without inserting.
 * Sets status to "sent" immediately since reminders are fire-and-forget.
 */
export const recordReminder = internalMutation({
  args: {
    loanId: v.id("loans"),
    idempotencyKey: v.string(),
  },
  returns: v.id("automationEvents"),
  handler: async (ctx, args) => {
    // Check for existing event with same idempotencyKey
    const existing = await ctx.db
      .query("automationEvents")
      .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .first();

    if (existing) {
      return existing._id;
    }

    const now = Date.now();
    const eventId = await ctx.db.insert("automationEvents", {
      loanId: args.loanId,
      type: "overdue_reminder",
      idempotencyKey: args.idempotencyKey,
      status: "sent",
      attempts: 0,
      lastError: undefined,
      createdAt: now,
      updatedAt: now,
    });

    return eventId;
  },
});
/**
 * Internal query to get event details + loan details for delivery.
 */
interface EventForDelivery {
  _id: string;
  loanId: string;
  type: string;
  idempotencyKey: string;
  status: string;
  attempts: number;
  createdAt: number;
  loan: {
    _id: string;
    toolId: string;
    borrowerId: string;
    ownerId: string;
    startDate: string;
    endDate: string;
    status: string;
    returnedAt: number | undefined;
  };
  tool: {
    _id: string;
    name: string;
  };
  owner: {
    _id: string;
    name: string;
    email: string;
  };
  borrower: {
    _id: string;
    name: string;
    email: string;
  };
}

export const getEventForDelivery = internalQuery({
  args: { eventId: v.id("automationEvents") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) {
      return null;
    }

    const loan = await ctx.db.get(event.loanId);
    if (!loan) {
      return null;
    }

    const tool = await ctx.db.get(loan.toolId);
    const ownerId = tool?.ownerId ?? loan.ownerId;
    const [owner, borrower] = await Promise.all([
      ctx.db.get(ownerId),
      ctx.db.get(loan.borrowerId),
    ]);

    if (!tool || !owner || !borrower) {
      return null;
    }

    return {
      _id: event._id,
      loanId: event.loanId,
      type: event.type,
      idempotencyKey: event.idempotencyKey,
      status: event.status,
      attempts: event.attempts,
      createdAt: event.createdAt,
      loan: {
        _id: loan._id,
        toolId: loan.toolId,
        borrowerId: loan.borrowerId,
        ownerId: loan.ownerId,
        startDate: loan.startDate,
        endDate: loan.endDate,
        status: loan.status,
        returnedAt: loan.returnedAt,
      },
      tool: {
        _id: tool._id,
        name: tool.name,
      },
      owner: {
        _id: owner._id,
        name: owner.name,
        email: owner.email,
      },
      borrower: {
        _id: borrower._id,
        name: borrower.name,
        email: borrower.email,
      },
    };
  },
});

interface EventData {
  event: {
    _id: string;
    loanId: string;
    type: string;
    idempotencyKey: string;
    status: string;
    attempts: number;
    createdAt: number;
  };
  loan: {
    _id: string;
    toolId: string;
    borrowerId: string;
    ownerId: string;
    startDate: string;
    endDate: string;
    status: string;
    returnedAt: number | undefined;
  };
  tool: {
    _id: string;
    name: string;
  };
  owner: {
    _id: string;
    name: string;
    email: string;
  };
  borrower: {
    _id: string;
    name: string;
    email: string;
  };
}

/**
 * Build the JSON payload for the webhook based on event type.
 */
function buildPayload(eventData: EventData): object {
  const { event: e, loan, tool, owner, borrower } = eventData;

  // Determine recipient based on event type
  // loan.requested, loan.cancelled -> tool owner
  // loan.approved, loan.declined, loan.returned, overdue_reminder -> borrower
  const isOwnerRecipient = e.type === "loan.requested" || e.type === "loan.cancelled";
  const recipient = isOwnerRecipient ? owner : borrower;
  const recipientRole: "owner" | "borrower" = isOwnerRecipient ? "owner" : "borrower";

  return {
    contractVersion: "v1",
    eventId: e.idempotencyKey,
    type: e.type,
    occurredAt: new Date(e.createdAt).toISOString(),
    loan: {
      loanId: loan._id,
      toolName: tool.name,
      borrowerName: borrower.name,
      borrowerEmail: borrower.email,
      ownerName: owner.name,
      ownerEmail: owner.email,
      status: loan.status,
      startDate: loan.startDate,
      endDate: loan.endDate,
    },
    startDate: loan.startDate,
    endDate: loan.endDate,
    recipient: {
      email: recipient.email,
      name: recipient.name,
      role: recipientRole,
    },
    recipientEmail: recipient.email,
    recipientName: recipient.name,
    recipientRole,
    borrowerEmail: borrower.email,
    borrowerName: borrower.name,
    ownerEmail: owner.email,
    ownerName: owner.name,
  };
}

/**
 * Action to deliver an outbox event to n8n webhook.
 * On non-2xx response, marks event failed and throws to trigger Convex retries.
 */
export const deliver = internalAction({
  args: { eventId: v.id("automationEvents") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const webhookUrl = process.env.N8N_WEBHOOK_URL || process.env.N8N_WORKFLOW_1_URL || N8N_WEBHOOK_URL;
    const secret = process.env.N8N_WEBHOOK_SECRET || N8N_WEBHOOK_SECRET;

    if (!webhookUrl || !secret) {
      throw new ConvexError({
        code: "INTERNAL_ERROR",
        message: "Webhook configuration missing",
      });
    }

    const eventData = await ctx.runQuery(internal.automation.getEventForDelivery, {
      eventId: args.eventId,
    });

    if (!eventData) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Event or related data not found",
      });
    }

    // Type assertion for eventData since the query returns v.any()
    const typedEventData = eventData as {
      _id: string;
      loanId: string;
      type: string;
      idempotencyKey: string;
      status: string;
      attempts: number;
      createdAt: number;
      loan: {
        _id: string;
        toolId: string;
        borrowerId: string;
        ownerId: string;
        startDate: string;
        endDate: string;
        dueDate?: number | undefined;
        status: string;
        returnedAt: number | undefined;
      };
      tool: {
        _id: string;
        name: string;
      };
      owner: {
        _id: string;
        name: string;
        email: string;
      };
      borrower: {
        _id: string;
        name: string;
        email: string;
      };
    };

    const payload = buildPayload({
      event: typedEventData,
      loan: typedEventData.loan,
      tool: typedEventData.tool,
      owner: typedEventData.owner,
      borrower: typedEventData.borrower,
    });
    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const path = new URL(webhookUrl).pathname;

    // Build canonical string and sign
    const canonical = `${timestamp}.POST.${path}.${body}`;
    const signature = await signPayload(secret, parseInt(timestamp, 10), "POST", path, body);

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-timestamp": timestamp,
        "x-signature": signature,
        "X-LL-Timestamp": timestamp,
        "X-LL-Signature": signature,
        "X-LL-Event-Id": typedEventData.idempotencyKey,
      },
      body,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      await ctx.runMutation(internal.automation.markEventFailed, {
        eventId: args.eventId,
        error: `HTTP ${response.status}: ${errorText.slice(0, 500)}`,
      });
      throw new ConvexError({
        code: "EXTERNAL_ERROR",
        message: `Webhook delivery failed: ${response.status}`,
      });
    }

    // Mark as sent
    await ctx.runMutation(internal.automation.markEventSent, {
      eventId: args.eventId,
    });

    return null;
  },
});